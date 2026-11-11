-- Registro dei cespiti: le correzioni della revisione (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 3).
--
-- 1. L'IVA che non si detrae segue le righe della fattura, in proporzione alla loro IVA, invece di
--    finire tutta sul conto della fattura. Vale per ogni fattura con i conti per riga; per un cespite
--    vuol dire che sta sul conto del bene, come nel costo del registro (prima, con un automezzo
--    detraibile al 40%, l'IVA indetraibile si deduceva due volte: subito e con gli ammortamenti).
-- 2. Storni e riaperture si registrano il primo giorno libero se il giornale è già stampato fino a
--    quella data (contabilita_data_utile), come i cedolini.
-- 3. Un anno senza quota registrata fra la base e l'anno chiesto si stima, e il fondo è «stimato».
-- 4. Annullare una cessione rimette il cespite com'era, anche nel Controllo di gestione.
-- 5. Il fondo iniziale non si cambia sotto quote già registrate, nemmeno dal Controllo di gestione.
-- 6. Ammortamenti scesi a zero: la scrittura rimasta si storna; la chiusura lo segnala.
-- 7. Una nota di credito non diventa un cespite.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cespiti ADD COLUMN IF NOT EXISTS prima_della_cessione jsonb;
COMMENT ON COLUMN public.cespiti.prima_della_cessione IS 'Fondo, data di dismissione e stato del cespite prima della cessione registrata: li rimette contabilita_cespite_annulla_cessione.';

CREATE OR REPLACE FUNCTION public.contabilita_righe_costo(k jsonb, p_righe jsonb, p_conti jsonb, p_imp numeric, p_extra numeric, p_ruolo text, p_descrizione text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_somma numeric; v_iva_righe numeric; v_segno numeric := 1; v_per jsonb := '{}'::jsonb; x record; v_conto text; v_fuori numeric;
  v_out jsonb := '[]'::jsonb; v_della_fattura text := k->>p_ruolo; v_extra_righe numeric := 0; v_quota numeric;
BEGIN
  IF p_conti IS NULL OR jsonb_typeof(p_conti) <> 'object' OR p_conti = '{}'::jsonb
     OR p_righe IS NULL OR jsonb_typeof(p_righe) <> 'array' THEN
    RETURN public.contabilita_riga(v_della_fattura, 'dare', p_imp + coalesce(p_extra, 0), p_descrizione);
  END IF;
  SELECT coalesce(sum(coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)), 0),
         coalesce(sum(coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)
                      * coalesce(nullif(r->>'aliquota_iva', '')::numeric, 0)), 0)
    INTO v_somma, v_iva_righe FROM jsonb_array_elements(p_righe) r;
  -- Le righe di una nota di credito sono scritte in positivo come la fattura: il segno lo dà l'imponibile.
  IF v_somma <> 0 AND sign(v_somma) <> sign(p_imp) THEN v_segno := -1; END IF;
  FOR x IN
    SELECT coalesce(nullif(r->>'numero_linea', ''), n::text) AS chiave,
           coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0) * v_segno AS importo,
           coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)
             * coalesce(nullif(r->>'aliquota_iva', '')::numeric, 0) AS iva
      FROM jsonb_array_elements(p_righe) WITH ORDINALITY t(r, n)
  LOOP
    v_conto := CASE WHEN p_conti ? x.chiave AND btrim(p_conti->>x.chiave) <> ''
                    THEN public.contabilita_conto_della_riga(k, p_conti->>x.chiave, p_ruolo)
                    ELSE v_della_fattura END;
    -- L'IVA che non si detrae è un costo accessorio di quello che si è comprato: va con la sua riga,
    -- in proporzione all'IVA della riga (un cespite la porta sul conto del bene).
    v_quota := CASE WHEN coalesce(p_extra, 0) <> 0 AND v_iva_righe <> 0 THEN round(p_extra * x.iva / v_iva_righe, 2) ELSE 0 END;
    v_extra_righe := v_extra_righe + v_quota;
    v_per := jsonb_set(v_per, ARRAY[v_conto], to_jsonb(coalesce((v_per->>v_conto)::numeric, 0) + x.importo + v_quota));
  END LOOP;
  -- Quello che le righe non spiegano (sconti in testata, arrotondamenti, centesimi dell'IVA): sul conto della fattura.
  v_fuori := round(p_imp - v_somma * v_segno, 2) + coalesce(p_extra, 0) - v_extra_righe;
  v_per := jsonb_set(v_per, ARRAY[v_della_fattura], to_jsonb(coalesce((v_per->>v_della_fattura)::numeric, 0) + v_fuori));
  FOR x IN SELECT key, value::numeric AS importo FROM jsonb_each_text(v_per) ORDER BY key LOOP
    v_out := v_out || public.contabilita_riga(x.key, 'dare', round(x.importo, 2), p_descrizione);
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.cespiti_fondo_iniziale_protetto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF (new.fondo_iniziale, new.fondo_iniziale_anno) IS DISTINCT FROM (old.fondo_iniziale, old.fondo_iniziale_anno)
     AND EXISTS (SELECT 1 FROM public.contabilita_cespiti_quote q WHERE q.cespite_id = new.id
                  AND q.esercizio < greatest(coalesce(new.fondo_iniziale_anno, 0), coalesce(old.fondo_iniziale_anno, 0), 2000)) THEN
    RAISE EXCEPTION 'Ci sono quote registrate prima di quell''anno: il fondo si legge già dal giornale' USING errcode = '23514';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.cespiti_fondo_iniziale_protetto() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_cespiti_fondo_iniziale_protetto ON public.cespiti;
CREATE TRIGGER trg_cespiti_fondo_iniziale_protetto BEFORE UPDATE OF fondo_iniziale, fondo_iniziale_anno ON public.cespiti
  FOR EACH ROW EXECUTE FUNCTION public.cespiti_fondo_iniziale_protetto();

CREATE OR REPLACE FUNCTION public.contabilita_cespite_fondo(c public.cespiti, p_anno int)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_aliq numeric := public.contabilita_cespite_aliquota(c); v_piena numeric; v_base int; v_fondo numeric;
  v_acq int := extract(year FROM c.data_acquisto)::int; v_stimato boolean; y int; v_q numeric;
BEGIN
  v_piena := round(c.costo_storico * coalesce(v_aliq, 0) / 100, 2);
  v_base := coalesce(c.fondo_iniziale_anno,
    (SELECT min(esercizio) FROM public.contabilita_cespiti_quote q WHERE q.cespite_id = c.id), p_anno);
  IF p_anno < v_base THEN v_base := p_anno; END IF;
  IF c.fondo_iniziale_anno IS NOT NULL AND v_base = c.fondo_iniziale_anno THEN
    v_fondo := c.fondo_iniziale; v_stimato := false;
  ELSE
    -- Stima con le regole di sempre: metà quota il primo anno, poi quote piene.
    v_fondo := CASE WHEN v_base - v_acq <= 0 THEN 0 ELSE least(c.costo_storico, round(v_piena * (v_base - v_acq - 0.5), 2)) END;
    v_stimato := v_acq < v_base;
  END IF;
  -- Da lì in poi le quote registrate; un anno in mezzo senza quota si stima, e lo si dice.
  FOR y IN greatest(v_base, v_acq) .. p_anno - 1 LOOP
    SELECT quota INTO v_q FROM public.contabilita_cespiti_quote q WHERE q.cespite_id = c.id AND q.esercizio = y;
    IF NOT FOUND THEN
      v_q := public.contabilita_cespite_quota(c, y, v_fondo);
      IF v_q > 0 THEN v_stimato := true; END IF;
    END IF;
    v_fondo := least(c.costo_storico, v_fondo + v_q);
  END LOOP;
  RETURN jsonb_build_object('fondo', v_fondo, 'stimato', v_stimato);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_fondo(public.cespiti, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contabilita_ammortamenti(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ammortamenti:' || p_company || ':' || p_anno)::uuid;
  c public.cespiti; v_conti jsonb; v_f jsonb; v_q numeric; v_quote jsonb := '[]'::jsonb; v_righe jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_mancano text[] := '{}'; v_vecchia record; v_registrati boolean; v_da_aggiornare boolean := false;
  v_per_cespite jsonb := '[]'::jsonb; x text;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;

  FOR c IN
    SELECT * FROM public.cespiti ce
     WHERE ce.company_id = p_company AND ce.data_acquisto IS NOT NULL AND extract(year FROM ce.data_acquisto) <= p_anno
       AND coalesce(ce.costo_storico, 0) > 0
       -- Dismesso prima dell'anno: niente. Ceduto nell'anno in contabilità: la quota sta nella cessione.
       AND (ce.data_dismissione IS NULL OR extract(year FROM ce.data_dismissione) >= p_anno)
       AND NOT (coalesce(extract(year FROM ce.data_dismissione) = p_anno, false) AND public.contabilita_documento_registrato(p_company, 'cessione_cespite', ce.id))
     ORDER BY ce.codice NULLS LAST, ce.descrizione, ce.id
  LOOP
    IF public.contabilita_cespite_aliquota(c) IS NULL THEN CONTINUE; END IF;
    v_f := public.contabilita_cespite_fondo(c, p_anno);
    v_q := public.contabilita_cespite_quota(c, p_anno, (v_f->>'fondo')::numeric);
    v_conti := public.contabilita_cespite_conti(c, k);
    v_quote := v_quote || jsonb_build_array(jsonb_build_object('id', c.id, 'cespite', c.descrizione, 'codice', c.codice,
      'categoria', c.categoria, 'costo', c.costo_storico, 'aliquota', public.contabilita_cespite_aliquota(c),
      'fondo_inizio', (v_f->>'fondo')::numeric, 'fondo_stimato', (v_f->>'stimato')::boolean, 'quota', v_q,
      'residuo', c.costo_storico - (v_f->>'fondo')::numeric - v_q,
      'conto_bene', v_conti->>'bene', 'conto_fondo', v_conti->>'fondo', 'conto_ammortamento', v_conti->>'ammortamento',
      'ruoli', v_conti->'ruoli'));
    IF v_q <= 0 THEN CONTINUE; END IF;
    FOR x IN SELECT jsonb_array_elements_text(v_conti->'mancanti') LOOP
      IF NOT x = ANY (v_mancano) AND x IN (v_conti->'ruoli'->>'fondo', v_conti->'ruoli'->>'ammortamento') THEN
        v_mancano := array_append(v_mancano, x);
      END IF;
    END LOOP;
    IF v_conti->>'fondo' IS NOT NULL AND v_conti->>'ammortamento' IS NOT NULL THEN
      v_righe := v_righe || public.contabilita_riga(v_conti->>'ammortamento', 'dare', v_q, c.descrizione)
                         || public.contabilita_riga(v_conti->>'fondo', 'avere', v_q, c.descrizione);
      v_per_cespite := v_per_cespite || jsonb_build_array(jsonb_build_object('id', c.id, 'quota', v_q));
    END IF;
    v_tot := v_tot + v_q;
  END LOOP;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'ammortamenti' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrati := v_vecchia.id IS NOT NULL;
  v_da_aggiornare := v_registrati AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo nel registro dei cespiti o in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrati OR v_da_aggiornare THEN
      IF v_registrati THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_vecchia.data_registrazione), 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Ammortamenti cambiati', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id), 'storno', v_vecchia.id, v_vecchia.id);
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ammortamenti',
          'Quote di ammortamento ' || p_anno, NULL, NULL, v_righe, 'ammortamenti', v_id, NULL);
      END IF;
      -- Il registro segue il giornale: le quote dell'anno sono quelle appena scritte.
      DELETE FROM public.contabilita_cespiti_quote WHERE company_id = p_company AND esercizio = p_anno AND origine = 'ammortamenti';
      INSERT INTO public.contabilita_cespiti_quote (cespite_id, company_id, esercizio, quota, origine)
      SELECT (y->>'id')::uuid, p_company, p_anno, (y->>'quota')::numeric, 'ammortamenti' FROM jsonb_array_elements(v_per_cespite) y;
      v_registrati := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('quote', v_quote, 'totale', v_tot, 'registrati', v_registrati,
    'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_ammortamenti(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_ammortamenti(uuid, int, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_fine_anno(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb; v_amm jsonb; v_lordo numeric; v_tfr numeric; v_id_tfr uuid; v_fatte jsonb := '[]'::jsonb; v_prima boolean;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  k := public.contabilita_conti_per_ruolo(p_company);
  v_id_tfr := md5('tfr:' || p_company || ':' || p_anno)::uuid;

  v_amm := public.contabilita_ammortamenti(p_company, p_anno, true);
  -- Anche a totale zero: una scrittura rimasta da un cespite tolto va stornata.
  IF NOT p_anteprima AND (((v_amm->>'totale')::numeric > 0 AND NOT (v_amm->>'registrati')::boolean) OR (v_amm->>'da_aggiornare')::boolean) THEN
    v_amm := public.contabilita_ammortamenti(p_company, p_anno, false);
    v_fatte := v_fatte || '["ammortamenti"]'::jsonb;
  END IF;

  SELECT coalesce(sum(lordo), 0) INTO v_lordo FROM public.hr_cedolini
   WHERE company_id = p_company AND anno = p_anno AND stato IN ('emesso', 'pagato');
  v_tfr := round(v_lordo / 13.5, 2);

  IF NOT p_anteprima AND v_tfr > 0 AND NOT public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr) THEN
    IF NOT (k ? '30.12' AND k ? '12.01') THEN
      RAISE EXCEPTION 'Mancano i conti per l''accantonamento TFR (30.12, 12.01)' USING ERRCODE = '22023';
    END IF;
    PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Accantonamento TFR',
      'Quota TFR ' || p_anno || ' sulle retribuzioni dei cedolini', NULL, NULL,
      public.contabilita_riga(k->>'30.12', 'dare', v_tfr, NULL) || public.contabilita_riga(k->>'12.01', 'avere', v_tfr, NULL),
      'tfr', v_id_tfr, NULL);
    v_fatte := v_fatte || '["tfr"]'::jsonb;
  END IF;
  v_prima := (v_amm->>'registrati')::boolean;
  RETURN jsonb_build_object('ammortamenti', v_amm->'quote', 'totale_ammortamenti', (v_amm->>'totale')::numeric,
    'retribuzioni', v_lordo, 'tfr', v_tfr,
    -- «Registrati» solo se il giornale è ancora quello giusto: un registro cambiato chiede di rifarli.
    'ammortamenti_registrati', v_prima AND NOT (v_amm->>'da_aggiornare')::boolean,
    'ammortamenti_da_aggiornare', (v_amm->>'da_aggiornare')::boolean,
    'conti_mancanti_ammortamenti', v_amm->'conti_mancanti',
    'tfr_registrato', public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr),
    'registrate', v_fatte);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_fine_anno(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_fine_anno(uuid, integer, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_cessione(p_cespite uuid, p_data date, p_prezzo numeric,
  p_conto_prezzo uuid DEFAULT NULL, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c public.cespiti; k jsonb; v_anno int; v_f jsonb; v_fondo numeric; v_q numeric; v_residuo numeric; v_diff numeric;
  v_conti jsonb; v_righe jsonb; v_mancano text[] := '{}'; v_desc text; v_amm_reg boolean; v_data date;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(c.company_id) ELSE public.contabilita_puo_scrivere(c.company_id) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR p_data < c.data_acquisto THEN RAISE EXCEPTION 'La data di cessione non può precedere l''acquisto' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_prezzo, -1) < 0 THEN RAISE EXCEPTION 'Il prezzo di cessione non è negativo (zero per una rottamazione)' USING ERRCODE = '22023'; END IF;
  IF public.contabilita_documento_registrato(c.company_id, 'cessione_cespite', c.id) THEN
    RAISE EXCEPTION 'La cessione di questo cespite è già registrata: annullala prima di rifarla' USING ERRCODE = '22023';
  END IF;
  k := public.contabilita_conti_per_ruolo(c.company_id);
  v_anno := extract(year FROM p_data)::int;
  v_f := public.contabilita_cespite_fondo(c, v_anno);
  v_fondo := (v_f->>'fondo')::numeric;
  v_q := public.contabilita_cespite_quota(c, v_anno, v_fondo, p_data);
  v_residuo := c.costo_storico - v_fondo - v_q;
  v_diff := round(p_prezzo - v_residuo, 2);
  v_conti := public.contabilita_cespite_conti(c, k);
  SELECT array_agg(x) INTO v_mancano FROM jsonb_array_elements_text(v_conti->'mancanti') x;
  v_mancano := coalesce(v_mancano, '{}');
  IF v_diff > 0 AND NOT k ? '20.04' THEN v_mancano := array_append(v_mancano, '20.04'); END IF;
  IF v_diff < 0 AND NOT k ? '30.40' THEN v_mancano := array_append(v_mancano, '30.40'); END IF;
  v_amm_reg := public.contabilita_documento_registrato(c.company_id, 'ammortamenti', md5('ammortamenti:' || c.company_id || ':' || v_anno)::uuid);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo nel registro dei cespiti o in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF p_prezzo > 0 AND (p_conto_prezzo IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.contabilita_conti WHERE id = p_conto_prezzo AND company_id = c.company_id AND movimentabile AND attivo)) THEN
      RAISE EXCEPTION 'Indica su quale conto sta il prezzo di vendita' USING ERRCODE = '22023';
    END IF;
    v_desc := 'Cessione ' || c.descrizione;
    v_righe := public.contabilita_riga(v_conti->>'ammortamento', 'dare', v_q, 'Quota ' || v_anno || ' fino alla cessione')
            || public.contabilita_riga(v_conti->>'fondo', 'avere', v_q, 'Quota ' || v_anno || ' fino alla cessione')
            || public.contabilita_riga(v_conti->>'fondo', 'dare', v_fondo + v_q, 'Chiusura del fondo')
            || public.contabilita_riga(v_conti->>'bene', 'avere', c.costo_storico, 'Uscita del bene')
            || public.contabilita_riga(p_conto_prezzo::text, 'dare', p_prezzo, 'Prezzo di cessione')
            || CASE WHEN v_diff > 0 THEN public.contabilita_riga(k->>'20.04', 'avere', v_diff, 'Plusvalenza')
                    ELSE public.contabilita_riga(k->>'30.40', 'dare', -v_diff, 'Minusvalenza') END;
    -- Giornale già stampato fino a quella data: si registra il primo giorno libero, con la data della cessione nel documento.
    v_data := public.contabilita_data_utile(c.company_id, p_data);
    PERFORM public.contabilita_inserisci_scrittura(c.company_id, v_data, 'Cessione cespite', v_desc, NULL, p_data,
      v_righe, 'cessione_cespite', c.id, NULL);
    UPDATE public.cespiti SET data_dismissione = p_data, is_active = false, prezzo_cessione = p_prezzo,
           prima_della_cessione = jsonb_build_object('fondo_amm', fondo_amm, 'data_dismissione', data_dismissione, 'is_active', is_active),
           fondo_amm = least(costo_storico, v_fondo + v_q), updated_at = now()
     WHERE id = c.id;
    INSERT INTO public.contabilita_cespiti_quote (cespite_id, company_id, esercizio, quota, origine)
    VALUES (c.id, c.company_id, v_anno, v_q, 'cessione')
    ON CONFLICT (cespite_id, esercizio) DO UPDATE SET quota = EXCLUDED.quota, origine = EXCLUDED.origine, created_at = now();
    -- Ammortamenti dell'anno già registrati: si rifanno senza questo cespite, che ha la quota nella cessione.
    IF v_amm_reg THEN PERFORM public.contabilita_ammortamenti(c.company_id, v_anno, false); END IF;
  END IF;
  RETURN jsonb_build_object('fondo_inizio', v_fondo, 'fondo_stimato', (v_f->>'stimato')::boolean, 'quota', v_q,
    'residuo', v_residuo, 'prezzo', p_prezzo, 'plusvalenza', greatest(v_diff, 0), 'minusvalenza', greatest(-v_diff, 0),
    'conti_mancanti', to_jsonb(v_mancano), 'registrata', NOT p_anteprima);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_cessione(uuid, date, numeric, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_cessione(uuid, date, numeric, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_annulla_cessione(p_cespite uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.cespiti; s record; v_anno int;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(c.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.contabilita_scritture x
   WHERE x.company_id = c.company_id AND x.origine = 'cessione_cespite' AND x.origine_id = c.id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = x.id)
   ORDER BY x.created_at DESC LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Nessuna cessione registrata per questo cespite' USING ERRCODE = '22023'; END IF;
  v_anno := extract(year FROM s.data_registrazione)::int;
  PERFORM public.contabilita_inserisci_scrittura(c.company_id, public.contabilita_data_utile(c.company_id, s.data_registrazione), 'Storno n. ' || s.numero || '/' || s.esercizio,
    'Cessione annullata', NULL, NULL,
    (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
       FROM public.contabilita_righe WHERE scrittura_id = s.id), 'storno', s.id, s.id);
  DELETE FROM public.contabilita_cespiti_quote WHERE cespite_id = c.id AND esercizio = v_anno AND origine = 'cessione';
  -- Il cespite torna com'era prima della cessione, anche nel Controllo di gestione.
  UPDATE public.cespiti SET
         data_dismissione = CASE WHEN prima_della_cessione ? 'data_dismissione' THEN (prima_della_cessione->>'data_dismissione')::date END,
         is_active = coalesce((prima_della_cessione->>'is_active')::boolean, true),
         fondo_amm = coalesce((prima_della_cessione->>'fondo_amm')::numeric, fondo_amm),
         prezzo_cessione = NULL, prima_della_cessione = NULL, updated_at = now()
   WHERE id = c.id;
  IF public.contabilita_documento_registrato(c.company_id, 'ammortamenti', md5('ammortamenti:' || c.company_id || ':' || v_anno)::uuid) THEN
    PERFORM public.contabilita_ammortamenti(c.company_id, v_anno, false);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_annulla_cessione(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_annulla_cessione(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_da_fattura(p_fattura uuid, p_linea text, p_descrizione text,
  p_categoria text, p_sottocategoria text, p_aliquota numeric, p_conto_bene uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f record; r jsonb; v_costo numeric; v_id uuid; k jsonb; v_ruoli jsonb; v_conto uuid; s record;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(f.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF f.tipo_documento IN ('TD04', 'TD08') THEN RAISE EXCEPTION 'Una nota di credito non diventa un cespite' USING ERRCODE = '22023'; END IF;
  IF p_categoria NOT IN ('materiale', 'immateriale') THEN RAISE EXCEPTION 'Categoria: materiale o immateriale' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_aliquota, 0) <= 0 OR p_aliquota > 100 THEN RAISE EXCEPTION 'Aliquota di ammortamento fra 0 e 100' USING ERRCODE = '22023'; END IF;
  SELECT x INTO r FROM jsonb_array_elements(coalesce(f.righe, '[]'::jsonb)) WITH ORDINALITY t(x, n)
   WHERE coalesce(nullif(x->>'numero_linea', ''), n::text) = p_linea LIMIT 1;
  IF r IS NULL THEN RAISE EXCEPTION 'Riga % non trovata nella fattura', p_linea USING ERRCODE = '22023'; END IF;
  v_costo := round(coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)
    * (1 + coalesce(nullif(r->>'aliquota_iva', '')::numeric, 0) / 100 * (1 - coalesce(f.detraibilita_percentuale, 100) / 100.0)), 2);
  IF v_costo <= 0 THEN RAISE EXCEPTION 'La riga non ha un importo positivo' USING ERRCODE = '22023'; END IF;

  k := public.contabilita_conti_per_ruolo(f.company_id);
  v_ruoli := public.contabilita_cespite_ruoli(p_categoria, p_sottocategoria, coalesce(nullif(btrim(p_descrizione), ''), r->>'descrizione'));
  v_conto := coalesce(p_conto_bene, (k->>(v_ruoli->>'bene'))::uuid);
  IF v_conto IS NULL THEN
    RAISE EXCEPTION 'Manca il conto del bene (%): sceglilo o crealo nel Piano dei conti', v_ruoli->>'bene' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cespiti (company_id, descrizione, categoria, sottocategoria, data_acquisto, costo_storico, aliquota_amm,
                              conto_bene_id, fattura_ricevuta_id, fattura_linea, created_by, note)
  VALUES (f.company_id, coalesce(nullif(btrim(p_descrizione), ''), left(r->>'descrizione', 200)), p_categoria, nullif(btrim(p_sottocategoria), ''),
          f.data_fattura, v_costo, p_aliquota, v_conto, f.id, p_linea, auth.uid(),
          'Dalla fattura ' || coalesce(f.numero_fattura, '') || ' di ' || coalesce(f.cedente_ragione_sociale, ''))
  RETURNING id INTO v_id;
  UPDATE public.fatture_ricevute SET conti_righe = conti_righe || jsonb_build_object(p_linea, 'conto:' || v_conto) WHERE id = f.id;

  SELECT * INTO s FROM public.contabilita_scritture x
   WHERE x.company_id = f.company_id AND x.origine = 'fattura_ricevuta' AND x.origine_id = f.id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = x.id)
   ORDER BY x.created_at DESC LIMIT 1;
  IF s.id IS NOT NULL THEN
    PERFORM public.contabilita_inserisci_scrittura(f.company_id, public.contabilita_data_utile(f.company_id, s.data_registrazione), 'Storno n. ' || s.numero || '/' || s.esercizio,
      'Riga ' || p_linea || ' passata fra i cespiti', NULL, NULL,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id), 'storno', s.id, s.id);
    PERFORM public.contabilita_genera_da_documenti(f.company_id, extract(year FROM f.data_fattura)::int, f.id);
    IF NOT public.contabilita_documento_registrato(f.company_id, 'fattura_ricevuta', f.id) THEN
      RAISE EXCEPTION 'La fattura non si è registrata di nuovo: niente è stato cambiato' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_da_fattura(uuid, text, text, text, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_da_fattura(uuid, text, text, text, text, numeric, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_cespite_imposta(p_cespite uuid, p_conto_bene uuid, p_conto_fondo uuid,
  p_conto_ammortamento uuid, p_fondo_iniziale numeric, p_fondo_iniziale_anno int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.cespiti;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(c.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Il controllo sul fondo iniziale sta nel trigger cespiti_fondo_iniziale_protetto: vale anche da Controllo di gestione.
  UPDATE public.cespiti SET conto_bene_id = p_conto_bene, conto_fondo_id = p_conto_fondo, conto_ammortamento_id = p_conto_ammortamento,
         fondo_iniziale = p_fondo_iniziale, fondo_iniziale_anno = p_fondo_iniziale_anno, updated_at = now()
   WHERE id = c.id;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_imposta(uuid, uuid, uuid, uuid, numeric, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_imposta(uuid, uuid, uuid, uuid, numeric, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_ratei_risconti_registra(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  v_id_storno uuid := md5('riapertura_ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  x record; v_q numeric; v_righe jsonb := '[]'::jsonb; v_elenco jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_ruolo text; v_vecchia record; v_vecchia_ap record; v_registrata boolean; v_da_aggiornare boolean := false; v_tot numeric := 0;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  FOR x IN SELECT r.*, c.codice, c.descrizione AS conto_descrizione FROM public.contabilita_ratei_risconti r
             JOIN public.contabilita_conti c ON c.id = r.conto_id
            WHERE r.company_id = p_company AND r.esercizio = p_anno ORDER BY r.tipo, r.created_at LOOP
    v_q := public.contabilita_quota_rateo_risconto(x.tipo, x.importo, x.dal, x.al, p_anno);
    v_ruolo := CASE x.tipo WHEN 'risconto_attivo' THEN '07.02' WHEN 'rateo_attivo' THEN '07.01' WHEN 'risconto_passivo' THEN '14.02' ELSE '14.01' END;
    IF NOT k ? v_ruolo AND NOT v_ruolo = ANY (v_mancano) THEN v_mancano := array_append(v_mancano, v_ruolo); END IF;
    v_elenco := v_elenco || jsonb_build_array(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'descrizione', x.descrizione,
      'conto', x.codice || ' ' || x.conto_descrizione, 'importo', x.importo, 'dal', x.dal, 'al', x.al, 'quota', v_q));
    -- Senza il conto del ruolo la riga non si scrive: l'anteprima lo segnala, la registrazione si ferma.
    IF v_q > 0 AND k ? v_ruolo THEN
      v_tot := v_tot + v_q;
      -- Attivi: in dare il conto di rateo/risconto; passivi: in avere. Il costo/ricavo dall'altra parte.
      IF x.tipo IN ('risconto_attivo', 'rateo_attivo') THEN
        v_righe := v_righe || public.contabilita_riga(k->>v_ruolo, 'dare', v_q, x.descrizione) || public.contabilita_riga(x.conto_id::text, 'avere', v_q, x.descrizione);
      ELSE
        v_righe := v_righe || public.contabilita_riga(x.conto_id::text, 'dare', v_q, x.descrizione) || public.contabilita_riga(k->>v_ruolo, 'avere', v_q, x.descrizione);
      END IF;
    END IF;
  END LOOP;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'ratei_risconti' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;
  -- Registrati, ma l'elenco di oggi non è più quello: vanno rifatti.
  v_da_aggiornare := v_registrata AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno, nel riquadro dei conti da usare)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrata OR v_da_aggiornare THEN
      -- Via le due di prima (31/12 e la sua riapertura all'01/01), poi le nuove.
      IF v_registrata THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, v_vecchia.data_registrazione, 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Ratei e risconti cambiati', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id), 'storno', v_vecchia.id, v_vecchia.id);
        SELECT * INTO v_vecchia_ap FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = 'riapertura_ratei_risconti' AND s.origine_id = v_id_storno
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_vecchia_ap.id IS NOT NULL THEN
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_vecchia_ap.data_registrazione), 'Storno n. ' || v_vecchia_ap.numero || '/' || v_vecchia_ap.esercizio,
            'Ratei e risconti cambiati', NULL, NULL,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_vecchia_ap.id), 'storno', v_vecchia_ap.id, v_vecchia_ap.id);
        END IF;
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ratei e risconti',
          'Ratei e risconti al 31/12/' || p_anno, NULL, NULL, v_righe, 'ratei_risconti', v_id, NULL);
        -- All'01/01 dell'anno dopo la stessa scrittura al contrario: la competenza torna sui costi e ricavi.
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, make_date(p_anno + 1, 1, 1)), 'Riapertura ratei e risconti',
          'Storno dei ratei e risconti del ' || p_anno, NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', y->>'conto_id', 'dare', coalesce((y->>'avere')::numeric, 0), 'avere', coalesce((y->>'dare')::numeric, 0), 'descrizione', y->>'descrizione'))
             FROM jsonb_array_elements(v_righe) y),
          'riapertura_ratei_risconti', v_id_storno, NULL);
      END IF;
      v_registrata := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('voci', v_elenco, 'totale', v_tot, 'registrata', v_registrata, 'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_ratei_risconti_registra(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_ratei_risconti_registra(uuid, int, boolean) TO authenticated, service_role;

-- La chiusura segnala anche gli ammortamenti da rifare.
CREATE OR REPLACE FUNCTION public.contabilita_chiudi_esercizio(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb; v_utile_conto uuid; v_mastro uuid; v_righe jsonb := '[]'::jsonb; v_aper jsonb := '[]'::jsonb;
  v_utile numeric := 0; x record; v_iva numeric := 0; v_fine jsonb; v_a_nuovo uuid; v_id_chiu uuid; v_id_aper uuid; v_aper_esiste boolean; v_n_ce int := 0; v_n_sp int := 0;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è già chiuso', p_anno USING ERRCODE = '23505';
  END IF;
  k := public.contabilita_conti_per_ruolo(p_company);
  v_id_chiu := md5('chiusura:' || p_company || ':' || p_anno)::uuid;
  v_id_aper := md5('apertura:' || p_company || ':' || (p_anno + 1))::uuid;
  v_aper_esiste := EXISTS (SELECT 1 FROM public.contabilita_scritture s
                            WHERE s.company_id = p_company AND s.esercizio = p_anno + 1 AND s.origine = 'apertura'
                              AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id));

  -- Epilogo: i conti economici col saldo dell'anno, girati al contrario.
  FOR x IN
    SELECT c.id, c.codice, c.descrizione, sum(r.dare - r.avere) AS saldo
      FROM public.contabilita_righe r
      JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
      JOIN public.contabilita_conti c ON c.id = r.conto_id
     WHERE s.company_id = p_company AND s.esercizio = p_anno AND c.natura IN ('costo', 'ricavo')
     GROUP BY c.id, c.codice, c.descrizione HAVING sum(r.dare - r.avere) <> 0 ORDER BY c.codice
  LOOP
    v_righe := v_righe || public.contabilita_riga(x.id::text, 'avere', x.saldo, 'chiusura del conto');
    v_utile := v_utile - x.saldo;   -- ricavi (saldo avere) fanno utile
    v_n_ce := v_n_ce + 1;
  END LOOP;

  -- Lo stato patrimoniale a fine anno, dopo l'epilogo (l'utile va sul suo conto).
  SELECT count(*) INTO v_n_sp FROM (
    SELECT c.id FROM public.contabilita_righe r
      JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
      JOIN public.contabilita_conti c ON c.id = r.conto_id
     WHERE s.company_id = p_company AND s.esercizio = p_anno AND c.natura IN ('attivo', 'passivo')
     GROUP BY c.id HAVING sum(r.dare - r.avere) <> 0) z;

  -- L'IVA dell'ultimo periodo va liquidata prima: ad anno chiuso la liquidazione al 31/12 non entra più.
  SELECT coalesce(sum(abs(t.saldo)), 0) INTO v_iva FROM (
    SELECT sum(r.dare - r.avere) AS saldo FROM public.contabilita_righe r
      JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
     WHERE s.company_id = p_company AND s.esercizio = p_anno
       AND r.conto_id IN ((k->>'13.10')::uuid, (k->>'05.10')::uuid)
     GROUP BY r.conto_id) t;
  v_fine := public.contabilita_fine_anno(p_company, p_anno, true);
  IF p_anteprima THEN
    RETURN jsonb_build_object('utile', v_utile, 'conti_economici', v_n_ce, 'conti_patrimoniali', v_n_sp,
      'apertura_gia_presente', v_aper_esiste, 'conto_utile', k ? '10.05', 'iva_non_liquidata', v_iva,
      'ammortamenti_da_registrare', ((v_fine->>'totale_ammortamenti')::numeric > 0 AND NOT (v_fine->>'ammortamenti_registrati')::boolean)
        OR coalesce((v_fine->>'ammortamenti_da_aggiornare')::boolean, false),
      'tfr_da_registrare', (v_fine->>'tfr')::numeric > 0 AND NOT (v_fine->>'tfr_registrato')::boolean);
  END IF;
  IF v_iva <> 0 THEN
    RAISE EXCEPTION 'IVA del % ancora da liquidare (%): registra prima la liquidazione dell''ultimo periodo', p_anno, v_iva USING ERRCODE = '22023';
  END IF;

  -- Il conto dell'utile: quello del piano, oppure si crea sotto il patrimonio netto.
  v_utile_conto := (k->>'10.05')::uuid;
  IF v_utile_conto IS NULL THEN
    SELECT id INTO v_mastro FROM public.contabilita_conti WHERE company_id = p_company AND codice = '10' AND NOT movimentabile;
    INSERT INTO public.contabilita_conti (company_id, codice, descrizione, natura, sezione_cee, voce_cee, movimentabile, mastro_id, codice_standard)
    VALUES (p_company, '10.05', 'Utile (perdita) dell''esercizio', 'passivo', 'SPP', 'A.IX', true, v_mastro, '10.05')
    ON CONFLICT (company_id, codice) DO UPDATE SET codice_standard = '10.05'
    RETURNING id INTO v_utile_conto;
  END IF;

  PERFORM set_config('contabilita.chiusura', 'on', true);
  IF v_n_ce > 0 THEN
    v_righe := v_righe || public.contabilita_riga(v_utile_conto::text, 'avere', v_utile,
      CASE WHEN v_utile >= 0 THEN 'utile dell''esercizio' ELSE 'perdita dell''esercizio' END);
    PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Chiusura conti economici',
      'Epilogo del conto economico ' || p_anno, NULL, NULL, v_righe, 'chiusura', v_id_chiu, NULL);
  END IF;

  IF NOT v_aper_esiste THEN
    -- L'utile (o la perdita) dell'anno chiuso si riapre fra gli utili portati a nuovo, se il piano ha il
    -- conto: altrimenti nel bilancio dell'anno dopo la voce A.IX sommerebbe il vecchio e il nuovo.
    v_a_nuovo := coalesce((k->>'10.04')::uuid, v_utile_conto);
    SELECT jsonb_agg(jsonb_build_object('conto_id', CASE WHEN id = v_utile_conto THEN v_a_nuovo ELSE id END,
                                        CASE WHEN saldo > 0 THEN 'dare' ELSE 'avere' END, abs(saldo),
                                        'descrizione', CASE WHEN id = v_utile_conto AND v_a_nuovo <> v_utile_conto THEN 'risultato ' || p_anno || ' portato a nuovo' END)
                     ORDER BY codice)
      INTO v_aper
      FROM (SELECT c.id, c.codice, sum(r.dare - r.avere) AS saldo
              FROM public.contabilita_righe r
              JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
              JOIN public.contabilita_conti c ON c.id = r.conto_id
             WHERE s.company_id = p_company AND s.esercizio = p_anno AND c.natura IN ('attivo', 'passivo')
             GROUP BY c.id, c.codice HAVING sum(r.dare - r.avere) <> 0) z;
    IF jsonb_array_length(coalesce(v_aper, '[]'::jsonb)) >= 2 THEN
      PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno + 1, 1, 1), 'Apertura conti',
        'Saldi al 31/12/' || p_anno, NULL, make_date(p_anno, 12, 31), v_aper, 'apertura', v_id_aper, NULL);
    END IF;
  END IF;
  PERFORM set_config('contabilita.chiusura', 'off', true);

  INSERT INTO public.contabilita_esercizi (company_id, anno, chiuso_il, chiuso_da, aggiornato_il)
  VALUES (p_company, p_anno, now(), auth.uid(), now())
  ON CONFLICT (company_id, anno) DO UPDATE SET chiuso_il = now(), chiuso_da = auth.uid(), aggiornato_il = now();

  RETURN jsonb_build_object('utile', v_utile, 'conti_economici', v_n_ce, 'conti_patrimoniali', v_n_sp,
    'apertura_registrata', NOT v_aper_esiste, 'apertura_gia_presente', v_aper_esiste);
END $$;
