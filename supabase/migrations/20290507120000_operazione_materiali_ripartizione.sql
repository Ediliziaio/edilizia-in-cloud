ALTER TABLE public.computo_uploads
  ADD COLUMN ripartizione_origine_id uuid REFERENCES public.computo_uploads(id) ON DELETE RESTRICT,
  ADD COLUMN ripartito boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX computo_ripartizione_destinazione
  ON public.computo_uploads (ripartizione_origine_id, order_id)
  WHERE ripartizione_origine_id IS NOT NULL;

CREATE TABLE public.computo_ripartizioni (
  voce_origine_id uuid NOT NULL REFERENCES public.computo_voci_estratte(id) ON DELETE RESTRICT,
  voce_dest_id uuid NOT NULL UNIQUE REFERENCES public.computo_voci_estratte(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  quantita numeric(14,4) NOT NULL CHECK (quantita > 0),
  PRIMARY KEY (voce_origine_id, order_id)
);
ALTER TABLE public.computo_ripartizioni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.computo_ripartizioni FROM PUBLIC, anon, authenticated;

-- Il conteggio globale serve a evitare sovra-allocazioni anche se l'utente può vedere solo alcune unità.
-- Solo per le unità visibili si restituisce la quota e l'identificativo di destinazione.
CREATE FUNCTION public.computo_ripartizione_elenco(p_generale uuid, p_computo uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  azienda uuid := public._materiali_proposti_azienda(p_generale);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.computo_uploads u JOIN public.orders o ON o.id = u.order_id
    WHERE u.id = p_computo AND o.id = p_generale AND u.company_id = azienda AND u.ripartizione_origine_id IS NULL
      AND o.workflow_kind = 'generale' AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Computo della generale non trovato' USING ERRCODE = 'P0002';
  END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(t.voce_origine_id, jsonb_build_object('assegnato', t.assegnato, 'destinazioni', t.destinazioni))
    FROM (
      SELECT r.voce_origine_id, sum(r.quantita) AS assegnato,
        coalesce(jsonb_object_agg(r.order_id, jsonb_build_object('quantita', r.quantita, 'computo_id', d.computo_upload_id)) FILTER (
          WHERE public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)), '{}'::jsonb) AS destinazioni
      FROM public.computo_ripartizioni r
      JOIN public.computo_voci_estratte v ON v.id = r.voce_origine_id
      JOIN public.computo_voci_estratte d ON d.id = r.voce_dest_id
      JOIN public.orders o ON o.id = r.order_id
      WHERE v.computo_upload_id = p_computo AND v.company_id = azienda
      GROUP BY r.voce_origine_id
    ) t
  ), '{}'::jsonb);
END;
$$;

CREATE FUNCTION public.computo_ripartizione_salva(p_generale uuid, p_computo uuid, p_destinazione uuid, p_quote jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  azienda uuid := public._materiali_proposti_azienda(p_generale);
  sorgente public.computo_uploads%ROWTYPE;
  scelta record;
  voce public.computo_voci_estratte%ROWTYPE;
  derivato uuid;
  voce_dest uuid;
  gia_ripartito numeric;
BEGIN
  -- Tutti gli scrittori serializzano sullo stesso ordine generale e sullo stesso computo.
  PERFORM 1 FROM public.orders WHERE id = p_generale AND workflow_kind = 'generale' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commessa generale non disponibile' USING ERRCODE = 'P0002'; END IF;
  IF public._materiali_proposti_azienda(p_destinazione) IS DISTINCT FROM azienda OR NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = p_destinazione AND o.company_id = azienda AND o.deleted_at IS NULL
      AND (o.id = p_generale OR o.commessa_generale_id = p_generale)
  ) THEN RAISE EXCEPTION 'Destinazione fuori dall’operazione' USING ERRCODE = '22023'; END IF;

  SELECT * INTO sorgente FROM public.computo_uploads
    WHERE id = p_computo AND order_id = p_generale AND company_id = azienda
      AND ripartizione_origine_id IS NULL AND extraction_status IN ('completed', 'review')
      AND stato <> 'archiviato' AND (variante_di IS NULL OR stato = 'contrattuale') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scegli un computo letto della generale' USING ERRCODE = 'P0002'; END IF;

  IF coalesce(jsonb_typeof(p_quote), '') <> 'object' OR p_quote = '{}'::jsonb THEN
    RAISE EXCEPTION 'Inserisci almeno una quantità' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_quote)) > 500 THEN
    RAISE EXCEPTION 'Salva al massimo 500 voci alla volta' USING ERRCODE = '22023';
  END IF;

  IF NOT sorgente.ripartito AND (
    EXISTS (SELECT 1 FROM public.materiali_proposti WHERE order_id = p_generale AND computo_upload_id = p_computo AND stato <> 'scartato')
    OR EXISTS (SELECT 1 FROM public.order_work_phase_voci w JOIN public.computo_voci_estratte v ON v.id = w.origine_id
      WHERE w.order_id = p_generale AND w.origine = 'computo' AND v.computo_upload_id = p_computo)
    OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.computo_voci_estratte v ON v.id = oi.computo_voce_id
      WHERE oi.order_id = p_generale AND v.computo_upload_id = p_computo)
  ) THEN RAISE EXCEPTION 'Il computo è già in uso nella generale. Ripartisci una revisione separata.' USING ERRCODE = '22023'; END IF;

  SELECT id INTO derivato FROM public.computo_uploads
    WHERE ripartizione_origine_id = p_computo AND order_id = p_destinazione FOR UPDATE;
  IF derivato IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.materiali_proposti WHERE order_id = p_destinazione AND computo_upload_id = derivato AND stato <> 'scartato')
    OR EXISTS (SELECT 1 FROM public.order_work_phase_voci w JOIN public.computo_voci_estratte v ON v.id = w.origine_id
      WHERE w.order_id = p_destinazione AND w.origine = 'computo' AND v.computo_upload_id = derivato)
  ) THEN RAISE EXCEPTION 'La quota è già in uso nelle proposte o nelle lavorazioni della destinazione' USING ERRCODE = '22023'; END IF;

  IF derivato IS NULL THEN
    INSERT INTO public.computo_uploads (company_id, order_id, uploaded_by, titolo, file_name, file_type,
      file_size, storage_path, extraction_status, extraction_method, stato, ripartizione_origine_id)
    VALUES (azienda, p_destinazione, auth.uid(), 'Ripartizione · ' || coalesce(sorgente.titolo, sorgente.file_name),
      sorgente.file_name, sorgente.file_type, 0, '', 'completed', sorgente.extraction_method, 'verificato', p_computo)
    RETURNING id INTO derivato;
  END IF;

  FOR scelta IN SELECT key::uuid AS id, value FROM jsonb_each(p_quote) ORDER BY key LOOP
    IF jsonb_typeof(scelta.value) <> 'number' THEN
      RAISE EXCEPTION 'Quantità non valida' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO voce FROM public.computo_voci_estratte WHERE id = scelta.id AND computo_upload_id = p_computo
      AND company_id = azienda FOR UPDATE;
    IF NOT FOUND OR coalesce(voce.quantita, 0) <= 0 OR voce.is_included IS FALSE OR voce.is_detrazione
      OR voce.quadro_voce = 'somme_a_disposizione' THEN
      RAISE EXCEPTION 'La voce non è ripartibile' USING ERRCODE = '22023';
    END IF;
    IF (scelta.value::numeric < 0 OR scelta.value::numeric <> round(scelta.value::numeric, 4))
      OR (voce.a_corpo AND scelta.value::numeric NOT IN (0, voce.quantita)) THEN
      RAISE EXCEPTION 'Usa una quantità positiva con al massimo 4 decimali. Le voci a corpo si assegnano intere.' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(sum(quantita), 0) INTO gia_ripartito FROM public.computo_ripartizioni
      WHERE voce_origine_id = voce.id AND order_id <> p_destinazione;
    IF gia_ripartito + scelta.value::numeric > voce.quantita THEN
      RAISE EXCEPTION 'Quota oltre il residuo per «%»', voce.descrizione_breve USING ERRCODE = '22023';
    END IF;

    SELECT voce_dest_id INTO voce_dest FROM public.computo_ripartizioni
      WHERE voce_origine_id = voce.id AND order_id = p_destinazione;
    IF scelta.value::numeric = 0 THEN
      IF voce_dest IS NOT NULL THEN
        DELETE FROM public.computo_ripartizioni WHERE voce_origine_id = voce.id AND order_id = p_destinazione;
        DELETE FROM public.computo_voci_estratte WHERE id = voce_dest;
      END IF;
      CONTINUE;
    END IF;

    IF voce_dest IS NULL THEN
      INSERT INTO public.computo_voci_estratte (computo_upload_id, company_id, ordine, numero_ordine, codice_voce,
        codice_tariffa, codice_prezzario, descrizione_breve, descrizione_estesa, unita_misura, quantita,
        prezzo_unitario_computo, importo_computo, super_categoria, categoria, sotto_categoria, capitolo_numero, capitolo_nome,
        is_sicurezza, a_corpo, warnings, matched_tariffa_id, matched_template_id, quadro_voce, voce_origine_id)
      VALUES (derivato, azienda, voce.ordine, voce.numero_ordine, voce.codice_voce,
        voce.codice_tariffa, voce.codice_prezzario, voce.descrizione_breve, voce.descrizione_estesa, voce.unita_misura, scelta.value::numeric,
        voce.prezzo_unitario_computo, round(voce.importo_computo * scelta.value::numeric / voce.quantita, 2),
        voce.super_categoria, voce.categoria, voce.sotto_categoria, voce.capitolo_numero, voce.capitolo_nome,
        voce.is_sicurezza, voce.a_corpo, voce.warnings, voce.matched_tariffa_id, voce.matched_template_id, voce.quadro_voce, voce.id)
      RETURNING id INTO voce_dest;
      INSERT INTO public.computo_ripartizioni(voce_origine_id, voce_dest_id, order_id, quantita)
      VALUES (voce.id, voce_dest, p_destinazione, scelta.value::numeric);
    ELSE
      UPDATE public.computo_ripartizioni SET quantita = scelta.value::numeric
        WHERE voce_origine_id = voce.id AND order_id = p_destinazione;
      UPDATE public.computo_voci_estratte SET quantita = scelta.value::numeric,
        importo_computo = round(voce.importo_computo * scelta.value::numeric / voce.quantita, 2) WHERE id = voce_dest;
    END IF;
  END LOOP;

  UPDATE public.computo_uploads SET totale_calcolato = (
    SELECT coalesce(sum(importo_computo), 0) FROM public.computo_voci_estratte WHERE computo_upload_id = derivato
  ) WHERE id = derivato;
  UPDATE public.computo_uploads SET ripartito = EXISTS (
    SELECT 1 FROM public.computo_ripartizioni r JOIN public.computo_voci_estratte v ON v.id = r.voce_origine_id
    WHERE v.computo_upload_id = p_computo
  ) WHERE id = p_computo;
  RETURN derivato;
END;
$$;

-- Anche gli altri editor devono rispettare le quote già assegnate.
CREATE FUNCTION public.computo_ripartizione_proteggi_voce()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  assegnato numeric;
BEGIN
  SELECT sum(quantita) INTO assegnato FROM public.computo_ripartizioni WHERE voce_origine_id = OLD.id;
  IF assegnato IS NOT NULL AND (
    (NEW.company_id, NEW.computo_upload_id, NEW.quantita, NEW.unita_misura, NEW.a_corpo, NEW.is_detrazione, NEW.is_included, NEW.quadro_voce, NEW.importo_computo, NEW.prezzo_unitario_computo)
    IS DISTINCT FROM
    (OLD.company_id, OLD.computo_upload_id, OLD.quantita, OLD.unita_misura, OLD.a_corpo, OLD.is_detrazione, OLD.is_included, OLD.quadro_voce, OLD.importo_computo, OLD.prezzo_unitario_computo)) THEN
    RAISE EXCEPTION 'La voce ha quote assegnate. Gestiscile dalla ripartizione.' USING ERRCODE = '22023';
  END IF;
  SELECT quantita INTO assegnato FROM public.computo_ripartizioni WHERE voce_dest_id = OLD.id;
  IF assegnato IS NOT NULL AND (NEW.quantita IS DISTINCT FROM assegnato OR
    (NEW.company_id, NEW.computo_upload_id, NEW.unita_misura, NEW.a_corpo, NEW.is_detrazione, NEW.is_included, NEW.voce_origine_id, NEW.prezzo_unitario_computo)
    IS DISTINCT FROM
    (OLD.company_id, OLD.computo_upload_id, OLD.unita_misura, OLD.a_corpo, OLD.is_detrazione, OLD.is_included, OLD.voce_origine_id, OLD.prezzo_unitario_computo)) THEN
    RAISE EXCEPTION 'Modifica la quota dalla commessa generale' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER computo_proteggi_quote BEFORE UPDATE ON public.computo_voci_estratte
FOR EACH ROW EXECUTE FUNCTION public.computo_ripartizione_proteggi_voce();

-- Sincronizza la generazione con la ripartizione del computo, anche tra schede già aperte.
CREATE FUNCTION public.computo_ripartizione_proteggi_generazione()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  fonte uuid;
  separato boolean;
BEGIN
  IF TG_TABLE_NAME = 'materiali_proposti' THEN
    fonte := NEW.computo_upload_id;
  ELSIF NEW.origine = 'computo' THEN
    SELECT computo_upload_id INTO fonte FROM public.computo_voci_estratte WHERE id = NEW.origine_id;
  END IF;
  IF fonte IS NOT NULL THEN
    SELECT u.ripartito INTO separato FROM public.computo_uploads u
      WHERE u.id = fonte AND u.order_id = NEW.order_id AND u.company_id = NEW.company_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Il computo non appartiene a questa commessa' USING ERRCODE = '22023';
    END IF;
    IF separato THEN
      RAISE EXCEPTION 'Questo computo è ripartito. Usa la quota della destinazione.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER computo_proteggi_proposte BEFORE INSERT OR UPDATE OF computo_upload_id ON public.materiali_proposti
FOR EACH ROW EXECUTE FUNCTION public.computo_ripartizione_proteggi_generazione();

CREATE FUNCTION public.computo_ripartizione_proteggi_documento()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.ripartito OR NEW.ripartizione_origine_id IS NOT NULL THEN
        RAISE EXCEPTION 'Crea quote dalla commessa generale' USING ERRCODE = '22023';
      END IF;
    ELSIF (NEW.ripartito, NEW.ripartizione_origine_id) IS DISTINCT FROM (OLD.ripartito, OLD.ripartizione_origine_id)
      OR ((OLD.ripartito OR OLD.ripartizione_origine_id IS NOT NULL)
        AND (NEW.order_id, NEW.company_id) IS DISTINCT FROM (OLD.order_id, OLD.company_id)) THEN
      RAISE EXCEPTION 'Modifica i collegamenti dalla ripartizione' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER computo_proteggi_documento BEFORE INSERT OR UPDATE OF ripartito, ripartizione_origine_id, order_id, company_id
ON public.computo_uploads FOR EACH ROW EXECUTE FUNCTION public.computo_ripartizione_proteggi_documento();
CREATE TRIGGER computo_proteggi_lavorazioni BEFORE INSERT OR UPDATE OF origine_id ON public.order_work_phase_voci
FOR EACH ROW EXECUTE FUNCTION public.computo_ripartizione_proteggi_generazione();

CREATE FUNCTION public.materiali_proposti_operazione(p_generale uuid)
RETURNS TABLE (order_id uuid, phase_id uuid, fase text, n bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  azienda uuid := public._materiali_proposti_azienda(p_generale);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_generale AND workflow_kind = 'generale' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Commessa generale non trovata' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  SELECT o.id, f.id, f.name, count(*)
    FROM public.orders o
    JOIN public.materiali_proposti p ON p.order_id = o.id AND p.company_id = azienda AND p.stato = 'proposto'
    LEFT JOIN public.order_work_phases f ON f.id = nullif(p.riga->>'phase_id', '')::uuid AND f.order_id = o.id
   WHERE o.company_id = azienda AND o.deleted_at IS NULL
     AND (o.id = p_generale OR o.commessa_generale_id = p_generale)
     AND public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
   GROUP BY o.id, f.id, f.name;
END;
$$;

REVOKE ALL ON FUNCTION public.computo_ripartizione_proteggi_voce(), public.computo_ripartizione_proteggi_generazione(),
  public.computo_ripartizione_proteggi_documento(),
  public.computo_ripartizione_elenco(uuid, uuid), public.computo_ripartizione_salva(uuid, uuid, uuid, jsonb),
  public.materiali_proposti_operazione(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.computo_ripartizione_elenco(uuid, uuid),
  public.computo_ripartizione_salva(uuid, uuid, uuid, jsonb), public.materiali_proposti_operazione(uuid) TO authenticated;
