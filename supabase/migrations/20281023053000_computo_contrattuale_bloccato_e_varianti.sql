-- ════════════════════════════════════════════════════════════════════════════
-- Computo contrattuale bloccato nel database, quadro economico, perizie di variante
-- ════════════════════════════════════════════════════════════════════════════
-- 2D S.r.l (lavori pubblici, D.Lgs. 36/2023). Fin qui lo stato «contrattuale»
-- del computo lo rispettava solo l'interfaccia: dalle API voci e misure si
-- potevano cambiare o cancellare, e «Sblocca» era un update qualsiasi.
--
--  1. computo_voci_estratte.quadro_voce: «lavori» o «somme_a_disposizione»
--     (IVA, spese tecniche, Inarcassa… non sono lavori). Null = proposta
--     automatica dell'app; scritta a mano per voce o per capitolo.
--  2. Varianti: computo_uploads.variante_di / numero_variante / motivo_variante,
--     computo_voci_estratte.voce_origine_id (la voce del contratto originario:
--     tiene insieme libretto e registro fra le versioni) e nuovo_prezzo (NP).
--  3. computo_eventi: registro di chi ha reso contrattuale, sbloccato (col
--     motivo) o approvato una variante.
--  4. Trigger di blocco su computo_uploads, computo_voci_estratte,
--     computo_voci_misure quando il computo è contrattuale. Si fanno da parte:
--       - nella purga di un'azienda (WHEN azienda_ancora_esiste, come le altre
--         guardie: 20280911100008);
--       - nel ripristino reale (session_replication_role = replica: i trigger
--         non scattano);
--       - per lo stato, solo dentro computo_sblocca_contrattuale e
--         computo_approva_variante (SECURITY DEFINER, permesso «Ordini e
--         Commesse» controllato lì), che accendono eic.computo_sblocco per la
--         sola transazione. Dalle API un utente non può impostare quella
--         variabile.
--  5. RPC: computo_sblocca_contrattuale(id, motivo), computo_crea_variante(id,
--     titolo, motivo), computo_approva_variante(id).
-- Nessuna riga scritta: colonne nullable, tabella nuova, funzioni, trigger.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1-2 · colonne ───────────────────────────────────────────────────────────
ALTER TABLE public.computo_voci_estratte
  ADD COLUMN IF NOT EXISTS quadro_voce text,
  ADD COLUMN IF NOT EXISTS voce_origine_id uuid REFERENCES public.computo_voci_estratte(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nuovo_prezzo boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.computo_voci_estratte
    ADD CONSTRAINT computo_voci_quadro_voce_check CHECK (quadro_voce IS NULL OR quadro_voce IN ('lavori', 'somme_a_disposizione'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.computo_voci_estratte.quadro_voce IS 'Sezione del quadro economico: lavori o somme a disposizione dell''amministrazione. Null = proposta automatica per parole chiave.';
COMMENT ON COLUMN public.computo_voci_estratte.voce_origine_id IS 'In una perizia di variante: la voce del contratto originario da cui discende (null = voce originaria o nuovo prezzo).';
COMMENT ON COLUMN public.computo_voci_estratte.nuovo_prezzo IS 'Nuovo prezzo (NP) introdotto con una perizia di variante.';

CREATE INDEX IF NOT EXISTS computo_voci_origine_idx ON public.computo_voci_estratte (voce_origine_id) WHERE voce_origine_id IS NOT NULL;

ALTER TABLE public.computo_uploads
  ADD COLUMN IF NOT EXISTS variante_di uuid REFERENCES public.computo_uploads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_variante integer,
  ADD COLUMN IF NOT EXISTS motivo_variante text,
  ADD COLUMN IF NOT EXISTS contrattuale_dal timestamptz;

COMMENT ON COLUMN public.computo_uploads.variante_di IS 'Perizia di variante: il computo contrattuale che modifica.';
CREATE INDEX IF NOT EXISTS computo_uploads_variante_idx ON public.computo_uploads (variante_di) WHERE variante_di IS NOT NULL;

-- ── 3 · registro degli eventi del computo ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.computo_eventi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  computo_upload_id uuid NOT NULL REFERENCES public.computo_uploads(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('reso_contrattuale', 'sbloccato', 'variante_creata', 'variante_approvata')),
  motivo text,
  utente_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.computo_eventi IS 'Chi ha reso contrattuale, sbloccato (con il motivo) o variato un computo di commessa. Scrivono solo trigger e funzioni.';
CREATE INDEX IF NOT EXISTS computo_eventi_upload_idx ON public.computo_eventi (computo_upload_id, created_at);
CREATE INDEX IF NOT EXISTS computo_eventi_company_idx ON public.computo_eventi (company_id);

ALTER TABLE public.computo_eventi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS computo_eventi_select ON public.computo_eventi;
CREATE POLICY computo_eventi_select ON public.computo_eventi FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
         AND NOT (SELECT public.utente_e_cliente_esterno()));
DROP POLICY IF EXISTS blocco_utente_bloccato ON public.computo_eventi;
CREATE POLICY blocco_utente_bloccato ON public.computo_eventi AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.utente_bloccato()))
  WITH CHECK (NOT (SELECT public.utente_bloccato()));
REVOKE ALL ON public.computo_eventi FROM anon, authenticated;
GRANT SELECT ON public.computo_eventi TO authenticated;
GRANT ALL ON public.computo_eventi TO service_role;

-- ── 4 · blocco del computo contrattuale ─────────────────────────────────────

-- Testata: un contrattuale non si cancella, non cambia i dati economici e non
-- esce dallo stato contrattuale se non dalle due funzioni qui sotto.
CREATE OR REPLACE FUNCTION public.computo_blocca_contrattuale_testata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  -- Bloccato: contrattuale, o contrattuale superato da una variante (archiviato con contrattuale_dal).
  v_bloccato boolean := OLD.stato = 'contrattuale' OR (OLD.stato = 'archiviato' AND OLD.contrattuale_dal IS NOT NULL);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_bloccato THEN
      RAISE EXCEPTION 'Computo contrattuale: non si può eliminare.' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF v_bloccato THEN
    IF NEW.stato IS DISTINCT FROM OLD.stato
       AND coalesce(current_setting('eic.computo_sblocco', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Computo contrattuale: per sbloccarlo serve «Ordini e Commesse» e il motivo (Sblocca nella scheda Computo).' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.ribasso_percentuale IS DISTINCT FROM OLD.ribasso_percentuale
      OR NEW.oneri_sicurezza IS DISTINCT FROM OLD.oneri_sicurezza
      OR NEW.lavoro_pubblico IS DISTINCT FROM OLD.lavoro_pubblico
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.variante_di IS DISTINCT FROM OLD.variante_di
      OR (NEW.contrattuale_dal IS DISTINCT FROM OLD.contrattuale_dal
          AND coalesce(current_setting('eic.computo_sblocco', true), '') <> 'on') THEN
      RAISE EXCEPTION 'Computo contrattuale: ribasso, sicurezza e dati del contratto non si cambiano. Serve una perizia di variante.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.stato = 'contrattuale' AND OLD.stato IS DISTINCT FROM 'contrattuale' THEN
    NEW.contrattuale_dal := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.computo_registra_contrattuale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF NEW.stato = 'contrattuale' AND OLD.stato IS DISTINCT FROM 'contrattuale'
     AND coalesce(current_setting('eic.computo_sblocco', true), '') <> 'on' THEN
    INSERT INTO public.computo_eventi (company_id, computo_upload_id, order_id, tipo, utente_id)
    VALUES (NEW.company_id, NEW.id, NEW.order_id, 'reso_contrattuale', auth.uid());
  END IF;
  RETURN NULL;
END;
$fn$;

-- Voci e misure: niente insert, update, delete su un computo contrattuale.
-- Delle voci restano libere solo le colonne di abbinamento al listino (non
-- cambiano il contratto); ogni altra colonna, anche futura, è bloccata.
CREATE OR REPLACE FUNCTION public.computo_blocca_contrattuale_voci()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_upload uuid;
  v_libere text[] := ARRAY['matched_template_id', 'matched_family_id', 'matched_tariffa_id', 'matched_name', 'match_type',
    'match_confidence', 'ai_notes', 'warnings', 'confidence', 'prezzo_unitario_impresa', 'ricarico_percentuale',
    'sconto_percentuale', 'importo_impresa'];
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_libere) = (to_jsonb(OLD) - v_libere) THEN
    RETURN NEW;
  END IF;
  FOR v_upload IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.computo_upload_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.computo_upload_id END]) AS x WHERE x IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM public.computo_uploads u WHERE u.id = v_upload
               AND (u.stato = 'contrattuale' OR (u.stato = 'archiviato' AND u.contrattuale_dal IS NOT NULL))) THEN
      RAISE EXCEPTION 'Computo contrattuale: le voci non si modificano. Per cambiarle serve una perizia di variante.' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.computo_blocca_contrattuale_misure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_voce uuid;
BEGIN
  FOR v_voce IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.voce_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.voce_id END]) AS x WHERE x IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM public.computo_voci_estratte v JOIN public.computo_uploads u ON u.id = v.computo_upload_id
               WHERE v.id = v_voce
                 AND (u.stato = 'contrattuale' OR (u.stato = 'archiviato' AND u.contrattuale_dal IS NOT NULL))) THEN
      RAISE EXCEPTION 'Computo contrattuale: le righe di misura non si modificano.' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

-- Funzioni di trigger: nessun EXECUTE serve (il privilegio non si controlla allo scatto).
REVOKE ALL ON FUNCTION public.computo_blocca_contrattuale_testata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.computo_registra_contrattuale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.computo_blocca_contrattuale_voci() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.computo_blocca_contrattuale_misure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_computo_blocca_contrattuale ON public.computo_uploads;
CREATE TRIGGER trg_computo_blocca_contrattuale
  BEFORE UPDATE OR DELETE ON public.computo_uploads
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.computo_blocca_contrattuale_testata();

DROP TRIGGER IF EXISTS trg_computo_registra_contrattuale ON public.computo_uploads;
CREATE TRIGGER trg_computo_registra_contrattuale
  AFTER UPDATE OF stato ON public.computo_uploads
  FOR EACH ROW EXECUTE FUNCTION public.computo_registra_contrattuale();

DROP TRIGGER IF EXISTS trg_computo_voci_blocca_contrattuale ON public.computo_voci_estratte;
CREATE TRIGGER trg_computo_voci_blocca_contrattuale
  BEFORE UPDATE OR DELETE ON public.computo_voci_estratte
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.computo_blocca_contrattuale_voci();
DROP TRIGGER IF EXISTS trg_computo_voci_blocca_contrattuale_ins ON public.computo_voci_estratte;
CREATE TRIGGER trg_computo_voci_blocca_contrattuale_ins
  BEFORE INSERT ON public.computo_voci_estratte
  FOR EACH ROW EXECUTE FUNCTION public.computo_blocca_contrattuale_voci();

DROP TRIGGER IF EXISTS trg_computo_misure_blocca_contrattuale ON public.computo_voci_misure;
CREATE TRIGGER trg_computo_misure_blocca_contrattuale
  BEFORE UPDATE OR DELETE ON public.computo_voci_misure
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.computo_blocca_contrattuale_misure();
DROP TRIGGER IF EXISTS trg_computo_misure_blocca_contrattuale_ins ON public.computo_voci_misure;
CREATE TRIGGER trg_computo_misure_blocca_contrattuale_ins
  BEFORE INSERT ON public.computo_voci_misure
  FOR EACH ROW EXECUTE FUNCTION public.computo_blocca_contrattuale_misure();

-- Chi può: «Ordini e Commesse» sulla commessa del computo (o, senza commessa,
-- nell'azienda del computo). Definer: legge computo e commessa senza RLS.
CREATE OR REPLACE FUNCTION public.puo_modificare_computo(p_upload_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT coalesce((
    SELECT CASE WHEN u.order_id IS NOT NULL THEN public.puo_modificare_commessa(u.order_id)
                ELSE public.has_permission_for_company((SELECT auth.uid()), 'can_edit_orders', u.company_id)
                     AND NOT (SELECT public.utente_bloccato()) END
      FROM public.computo_uploads u WHERE u.id = p_upload_id), false);
$fn$;
REVOKE ALL ON FUNCTION public.puo_modificare_computo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puo_modificare_computo(uuid) TO authenticated, service_role;

-- ── 5 · sblocco, variante ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.computo_sblocca_contrattuale(p_upload_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v public.computo_uploads%rowtype;
BEGIN
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'Scrivi il motivo dello sblocco (almeno 10 caratteri).' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v FROM public.computo_uploads WHERE id = p_upload_id FOR UPDATE;
  IF NOT FOUND OR NOT public.puo_modificare_computo(p_upload_id) THEN
    RAISE EXCEPTION 'Per sbloccare il computo contrattuale serve il permesso «Ordini e Commesse».' USING ERRCODE = '42501';
  END IF;
  IF v.stato <> 'contrattuale' THEN
    RAISE EXCEPTION 'Il computo non è contrattuale.' USING ERRCODE = 'P0001';
  END IF;
  -- Con la contabilità avviata il contratto non si riapre: si fa una perizia di variante.
  IF to_regclass('public.lp_libretto') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.lp_libretto l WHERE l.computo_upload_id = p_upload_id) THEN
    RAISE EXCEPTION 'Il computo ha già registrazioni nel libretto delle misure: per cambiarlo serve una perizia di variante.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('eic.computo_sblocco', 'on', true);
  UPDATE public.computo_uploads SET stato = 'verificato', contrattuale_dal = NULL, updated_at = now() WHERE id = p_upload_id;
  PERFORM set_config('eic.computo_sblocco', '', true);
  INSERT INTO public.computo_eventi (company_id, computo_upload_id, order_id, tipo, motivo, utente_id)
  VALUES (v.company_id, v.id, v.order_id, 'sbloccato', btrim(p_motivo), auth.uid());
END;
$fn$;
REVOKE ALL ON FUNCTION public.computo_sblocca_contrattuale(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.computo_sblocca_contrattuale(uuid, text) TO authenticated, service_role;

-- Crea la perizia di variante: copia del contrattuale (testata, voci, misure)
-- in bozza, ogni voce legata a quella del contratto originario.
CREATE OR REPLACE FUNCTION public.computo_crea_variante(p_upload_id uuid, p_titolo text, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '30s'
AS $fn$
DECLARE
  v public.computo_uploads%rowtype;
  v_nuovo uuid;
  v_numero integer;
BEGIN
  SELECT * INTO v FROM public.computo_uploads WHERE id = p_upload_id FOR UPDATE;
  IF NOT FOUND OR NOT public.puo_modificare_computo(p_upload_id) THEN
    RAISE EXCEPTION 'Per una perizia di variante serve il permesso «Ordini e Commesse».' USING ERRCODE = '42501';
  END IF;
  IF v.stato <> 'contrattuale' THEN
    RAISE EXCEPTION 'La variante si fa sul computo contrattuale.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.computo_uploads x WHERE x.variante_di = p_upload_id AND x.stato IN ('bozza', 'verificato')) THEN
    RAISE EXCEPTION 'C''è già una perizia di variante aperta su questo computo.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(max(x.numero_variante), 0) + 1 INTO v_numero
    FROM public.computo_uploads x WHERE x.company_id = v.company_id AND x.order_id IS NOT DISTINCT FROM v.order_id;

  INSERT INTO public.computo_uploads (company_id, uploaded_by, file_name, file_type, file_size, storage_path, extraction_status,
    extraction_method, extraction_completed_at, oggetto_lavori, committente, progettista, data_computo, order_id, titolo, stato,
    totale_dichiarato, totale_calcolato, prezzari, lavoro_pubblico, stazione_appaltante, cig, cup, ribasso_percentuale,
    oneri_sicurezza, variante_di, numero_variante, motivo_variante)
  VALUES (v.company_id, auth.uid(), v.file_name, v.file_type, v.file_size, v.storage_path, 'review',
    v.extraction_method, now(), v.oggetto_lavori, v.committente, v.progettista, v.data_computo, v.order_id,
    coalesce(nullif(btrim(p_titolo), ''), 'Perizia di variante n. ' || v_numero), 'bozza',
    NULL, NULL, v.prezzari, v.lavoro_pubblico, v.stazione_appaltante, v.cig, v.cup, v.ribasso_percentuale,
    v.oneri_sicurezza, v.id, v_numero, nullif(btrim(p_motivo), ''))
  RETURNING id INTO v_nuovo;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.computo_variante_mappa (vecchia uuid PRIMARY KEY, nuova uuid NOT NULL) ON COMMIT DROP;
  DELETE FROM pg_temp.computo_variante_mappa;
  INSERT INTO pg_temp.computo_variante_mappa (vecchia, nuova)
    SELECT ve.id, gen_random_uuid() FROM public.computo_voci_estratte ve WHERE ve.computo_upload_id = v.id;

  INSERT INTO public.computo_voci_estratte (id, computo_upload_id, company_id, capitolo_numero, capitolo_nome, codice_voce,
    codice_prezzario, descrizione_breve, descrizione_estesa, unita_misura, quantita, prezzo_unitario_computo, importo_computo,
    confidence, warnings, ai_notes, is_included, ordine, numero_ordine, codice_tariffa, super_categoria, categoria,
    sotto_categoria, is_sicurezza, is_detrazione, a_corpo, quadro_voce, voce_origine_id, nuovo_prezzo)
  SELECT m.nuova, v_nuovo, ve.company_id, ve.capitolo_numero, ve.capitolo_nome, ve.codice_voce,
    ve.codice_prezzario, ve.descrizione_breve, ve.descrizione_estesa, ve.unita_misura, ve.quantita, ve.prezzo_unitario_computo,
    ve.importo_computo, ve.confidence, ve.warnings, ve.ai_notes, ve.is_included, ve.ordine, ve.numero_ordine, ve.codice_tariffa,
    ve.super_categoria, ve.categoria, ve.sotto_categoria, ve.is_sicurezza, ve.is_detrazione, ve.a_corpo, ve.quadro_voce,
    coalesce(ve.voce_origine_id, ve.id), ve.nuovo_prezzo
  FROM public.computo_voci_estratte ve JOIN pg_temp.computo_variante_mappa m ON m.vecchia = ve.id;

  INSERT INTO public.computo_voci_misure (company_id, voce_id, ordine, descrizione, parti_uguali, lunghezza, larghezza,
    altezza_peso, quantita, formula)
  SELECT mi.company_id, m.nuova, mi.ordine, mi.descrizione, mi.parti_uguali, mi.lunghezza, mi.larghezza, mi.altezza_peso,
    mi.quantita, mi.formula
  FROM public.computo_voci_misure mi JOIN pg_temp.computo_variante_mappa m ON m.vecchia = mi.voce_id;

  INSERT INTO public.computo_eventi (company_id, computo_upload_id, order_id, tipo, motivo, utente_id)
  VALUES (v.company_id, v_nuovo, v.order_id, 'variante_creata', nullif(btrim(p_motivo), ''), auth.uid());
  RETURN v_nuovo;
END;
$fn$;
REVOKE ALL ON FUNCTION public.computo_crea_variante(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.computo_crea_variante(uuid, text, text) TO authenticated, service_role;

-- Approva la variante: diventa il computo contrattuale, il precedente si archivia.
CREATE OR REPLACE FUNCTION public.computo_approva_variante(p_variante_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v public.computo_uploads%rowtype;
  v_base public.computo_uploads%rowtype;
BEGIN
  SELECT * INTO v FROM public.computo_uploads WHERE id = p_variante_id FOR UPDATE;
  IF NOT FOUND OR NOT public.puo_modificare_computo(p_variante_id) THEN
    RAISE EXCEPTION 'Per approvare la perizia di variante serve il permesso «Ordini e Commesse».' USING ERRCODE = '42501';
  END IF;
  IF v.variante_di IS NULL OR v.stato NOT IN ('bozza', 'verificato') THEN
    RAISE EXCEPTION 'Non è una perizia di variante da approvare.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_base FROM public.computo_uploads WHERE id = v.variante_di FOR UPDATE;
  IF NOT FOUND OR v_base.stato <> 'contrattuale' THEN
    RAISE EXCEPTION 'Il computo di partenza non è più il contrattuale: crea la variante da quello attuale.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.computo_voci_estratte WHERE computo_upload_id = p_variante_id) THEN
    RAISE EXCEPTION 'La variante non ha voci.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('eic.computo_sblocco', 'on', true);
  UPDATE public.computo_uploads SET stato = 'archiviato', updated_at = now() WHERE id = v_base.id;
  UPDATE public.computo_uploads SET stato = 'contrattuale', updated_at = now() WHERE id = p_variante_id;
  PERFORM set_config('eic.computo_sblocco', '', true);
  INSERT INTO public.computo_eventi (company_id, computo_upload_id, order_id, tipo, motivo, utente_id)
  VALUES (v.company_id, v.id, v.order_id, 'variante_approvata', v.motivo_variante, auth.uid());
END;
$fn$;
REVOKE ALL ON FUNCTION public.computo_approva_variante(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.computo_approva_variante(uuid) TO authenticated, service_role;
