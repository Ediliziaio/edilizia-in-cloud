-- Contabilità generale, lotto B delle correzioni dal controllo dell'11/11/2026: fisco e F24.
--
-- 1. Tributi F24 (contabilita_ruolo_tributo): acconti IRES/IRAP (2001, 2002, 3812, 3813) fra i crediti
--    05.12; saldi (2003, 3800) a chiusura del debito per imposte; acconto IVA 6013 su Erario c/IVA;
--    imposta sostitutiva TFR (1712, 1713) dal fondo TFR; interessi (1989-1994) fra gli oneri
--    finanziari; righe a credito (compensazioni): bonus edilizi (77xx, 639x, 6921-6931) su 05.13, altri
--    crediti d'imposta (69xx) su 05.12. Senza il conto, «Partite da verificare» invece degli oneri.
-- 2. Liquidazione trimestrale (impostazioni IVA): 1% di interessi a costo e su Erario c/IVA.
-- 3. Imposte dell'esercizio: contabilita_imposte_esercizio + contabilita_imposte (31/12: imposte a
--    costo, acconti chiusi, saldo fra i debiti); la chiusura lo ricorda (imposte_da_stanziare).
-- 4. Sconto in fattura dei bonus edilizi: ricavo pieno e credito d'imposta (05.13, nuovo nel piano
--    standard). Cessione del credito in prima nota: esce il credito.
-- 5. Pagamenti «fiscale» di prima nota senza F24: il conto dalla descrizione, altrimenti da guardare.
-- Funzioni riprese intere (dopo il lotto A), cambiate nei punti detti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.contabilita_ruolo_tributo(k jsonb, p_tributo text, p_cedolini boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  -- Il tributo dice quale debito si chiude: IVA, ritenute, contributi, imposte. IVA (accantonata
  -- dalla liquidazione) e ritenute dei professionisti (accantonate al pagamento) chiudono il loro
  -- debito. Il resto non ha un debito registrato prima: ritenute e addizionali dei dipendenti sono
  -- parte della retribuzione, i contributi sono oneri sociali, IRES e IRAP imposte dell'esercizio.
  -- Acconti e crediti d'imposta sono crediti, saldi delle imposte debiti, l'imposta sostitutiva sul
  -- TFR riduce il fondo; sanzioni e interessi del ravvedimento sono costi. Senza il conto del ruolo,
  -- quello che non è un costo va su «Partite da verificare», non fra gli oneri.
  SELECT CASE WHEN k ? r THEN r
              WHEN r = '13.12' AND k ? '13.13' THEN '13.13'
              WHEN r = '05.13' AND k ? '05.12' THEN '05.12'
              WHEN r IN ('05.12', '05.13', '13.13', '12.01') AND k ? '13.90' THEN '13.90'
              WHEN k ? '30.40' THEN '30.40' ELSE '30.01' END
    FROM (SELECT CASE
      WHEN p_tributo ~ '^60(0[1-9]|1[0-3]|3[1-8]|99)$' OR p_tributo IN ('6035', '6040', '6041') THEN '13.11'
      -- Acconti IRES e IRAP: crediti verso l'Erario fino allo stanziamento delle imposte.
      WHEN p_tributo IN ('2001', '2002', '3812', '3813') THEN '05.12'
      -- Saldi IRES e IRAP: chiudono il debito per imposte stanziato l'anno prima.
      WHEN p_tributo IN ('2003', '3800') THEN '13.13'
      -- Imposta sostitutiva sulla rivalutazione del TFR: la paga l'azienda per i dipendenti, dal fondo.
      WHEN p_tributo IN ('1712', '1713') THEN '12.01'
      -- Interessi del ravvedimento e della rateazione.
      WHEN p_tributo IN ('1668', '1989', '1990', '1991', '1992', '1993', '1994', '3805') THEN '40.02'
      -- Crediti d'imposta usati in compensazione (righe a credito dell'F24): quelli dei bonus edilizi
      -- (ceduti o scontati in fattura: 77xx, 639x, 6921-6931) sul loro conto, gli altri (beni
      -- strumentali 4.0 e simili) fra i crediti d'imposta.
      WHEN p_tributo ~ '^(77[0-9]{2}|639[0-9]|692[1-9]|693[01])$' THEN '05.13'
      WHEN p_tributo ~ '^69[0-9]{2}$' THEN '05.12'
      WHEN p_tributo IN ('1038', '1040') THEN '13.12'
      WHEN p_cedolini AND (p_tributo ~ '^10[0-9]{2}$' OR p_tributo ~ '^38(0[1-9]|4[0-9])$') THEN '13.12'
      WHEN p_cedolini AND p_tributo ~ '^[A-Z]' THEN '13.20'
      WHEN p_tributo ~ '^10[0-9]{2}$' OR p_tributo ~ '^38(0[1-9]|4[0-9])$' THEN '30.10'
      WHEN p_tributo ~ '^[A-Z]' THEN '30.11'
      WHEN p_tributo ~ '^(20|38|17|40)[0-9]{2}$' THEN '50.01'
      ELSE '30.40' END AS r) x;
$$;

CREATE OR REPLACE FUNCTION public.contabilita_liquida_iva(p_company uuid, p_dal date, p_al date, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb; v_id uuid; v_vendite numeric; v_acquisti numeric; v_saldo numeric; v_credito_prec numeric := 0;
  v_compensato numeric := 0; v_conto_credito text; v_righe jsonb; v_scrittura uuid; v_interessi numeric := 0; v_trimestrale boolean;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_dal IS NULL OR p_al IS NULL OR p_al < p_dal OR extract(year FROM p_dal) <> extract(year FROM p_al) THEN
    RAISE EXCEPTION 'Periodo non valido' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  SELECT coalesce(jsonb_object_agg(chiave, id), '{}'::jsonb) INTO k FROM (
    SELECT DISTINCT ON (chiave) chiave, id FROM (
      SELECT coalesce(codice_standard, codice) AS chiave, id, codice_standard IS NOT NULL AS esplicito, codice
        FROM public.contabilita_conti WHERE company_id = p_company AND movimentabile AND attivo
    ) x ORDER BY chiave, esplicito DESC, codice
  ) y;
  IF NOT (k ? '13.10' AND k ? '05.10' AND k ? '13.11') THEN
    RAISE EXCEPTION 'Mancano i conti IVA su vendite, IVA su acquisti ed Erario c/IVA (13.10, 05.10, 13.11)' USING ERRCODE = '22023';
  END IF;
  v_conto_credito := CASE WHEN k ? '05.11' THEN '05.11' ELSE '13.11' END;
  v_id := md5('liquidazione-iva:' || p_company || ':' || p_dal || ':' || p_al)::uuid;

  -- Dai saldi a fine periodo, liquidazioni comprese: quello che è già stato girato non si gira
  -- due volte (gennaio e poi il trimestre), e un documento registrato dopo la liquidazione del
  -- suo mese entra nella prima liquidazione utile.
  SELECT coalesce(sum(r.avere - r.dare) FILTER (WHERE r.conto_id = (k->>'13.10')::uuid), 0),
         coalesce(sum(r.dare - r.avere) FILTER (WHERE r.conto_id = (k->>'05.10')::uuid), 0)
    INTO v_vendite, v_acquisti
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND s.data_registrazione <= p_al
     AND s.esercizio = extract(year FROM p_al)::int;
  -- Credito delle liquidazioni prima di questa: saldo dare del conto del credito a fine periodo,
  -- senza la liquidazione di questo stesso periodo (anche un trimestre dopo i suoi mesi lo vede).
  SELECT coalesce(sum(r.dare - r.avere), 0) INTO v_credito_prec
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND r.conto_id = (k->>v_conto_credito)::uuid AND s.data_registrazione <= p_al
     AND s.origine_id IS DISTINCT FROM v_id
     -- Dopo una chiusura il credito è già nell'apertura dell'anno: gli anni prima non si sommano di nuovo.
     AND (s.esercizio = extract(year FROM p_al)::int OR NOT EXISTS (
           SELECT 1 FROM public.contabilita_scritture a WHERE a.company_id = p_company AND a.esercizio = extract(year FROM p_al)::int
              AND a.origine = 'apertura' AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = a.id)));
  v_credito_prec := greatest(v_credito_prec, 0);
  v_saldo := v_vendite - v_acquisti;
  IF v_saldo > 0 THEN v_compensato := least(v_credito_prec, v_saldo); END IF;
  -- Trimestrale per opzione: l'IVA da versare cresce dell'1% di interessi, che sono un costo.
  v_trimestrale := p_al - p_dal > 40 AND EXISTS (SELECT 1 FROM public.fiscalita_impostazioni_iva i
    WHERE i.company_id = p_company AND i.anno = extract(year FROM p_al)::int AND i.periodicita = 'trimestrale');
  IF v_trimestrale AND v_saldo - v_compensato >= 25.82 THEN v_interessi := round((v_saldo - v_compensato) * 0.01, 2); END IF;

  IF NOT p_anteprima THEN
    IF public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id) THEN
      RAISE EXCEPTION 'Questo periodo è già liquidato: storna la liquidazione per rifarla' USING ERRCODE = '23505';
    END IF;
    IF v_vendite = 0 AND v_acquisti = 0 THEN RAISE EXCEPTION 'Nessuna IVA da liquidare nel periodo' USING ERRCODE = '22023'; END IF;
    -- Sotto 25,82 euro non si versa: il debito passa al periodo dopo (non si liquida). L'ultimo
    -- periodo dell'anno si liquida comunque: il debito resta su Erario c/IVA e si versa col primo
    -- periodo dell'anno dopo, e l'esercizio si può chiudere.
    IF v_saldo - v_compensato > 0 AND v_saldo - v_compensato < 25.82 AND p_al <> make_date(extract(year FROM p_al)::int, 12, 31) THEN
      RAISE EXCEPTION 'IVA da versare sotto 25,82 €: si somma al periodo successivo' USING ERRCODE = '22023';
    END IF;
    v_righe := public.contabilita_riga(k->>'13.10', 'dare', v_vendite, 'IVA su vendite del periodo')
            || public.contabilita_riga(k->>'05.10', 'avere', v_acquisti, 'IVA su acquisti del periodo')
            || public.contabilita_riga(k->>v_conto_credito, 'avere', v_compensato, 'credito dei periodi precedenti');
    IF v_saldo > 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'13.11', 'avere', v_saldo - v_compensato, 'IVA da versare');
    ELSE
      v_righe := v_righe || public.contabilita_riga(k->>v_conto_credito, 'dare', -v_saldo, 'IVA a credito');
    END IF;
    IF v_interessi > 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>(CASE WHEN k ? '40.02' THEN '40.02' WHEN k ? '30.40' THEN '30.40' ELSE '30.01' END), 'dare', v_interessi, 'interessi 1% liquidazione trimestrale')
                         || public.contabilita_riga(k->>'13.11', 'avere', v_interessi, 'interessi 1% liquidazione trimestrale');
    END IF;
    v_scrittura := public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, p_al), 'Liquidazione IVA',
      'Liquidazione IVA dal ' || to_char(p_dal, 'DD/MM/YYYY') || ' al ' || to_char(p_al, 'DD/MM/YYYY'),
      NULL, NULL, v_righe, 'liquidazione_iva', v_id, NULL);
  END IF;
  RETURN jsonb_build_object('iva_vendite', v_vendite, 'iva_acquisti', v_acquisti, 'saldo', v_saldo,
    'credito_precedente', v_credito_prec, 'compensato', v_compensato,
    'da_versare', greatest(v_saldo - v_compensato, 0),
    'sotto_minimo', v_saldo - v_compensato > 0 AND v_saldo - v_compensato < 25.82 AND p_al <> make_date(extract(year FROM p_al)::int, 12, 31), 'a_credito', greatest(-v_saldo, 0),
    'gia_liquidato', public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id),
    'interessi', v_interessi, 'scrittura_id', v_scrittura);
END $$;

-- Le imposte dell'esercizio (IRES e IRAP) stanziate al 31/12: D imposte (50.01), A acconti versati
-- (05.12, fino all'imposta) e debito per imposte (13.13) per il resto. Gli importi li scrive chi tiene
-- la contabilità (li calcola lo studio, o la dichiarazione); gli acconti versati si leggono dagli F24
-- pagati nell'anno (2001, 2002, 3812, 3813). Se cambiano, la scrittura si storna e si rifà.
CREATE TABLE IF NOT EXISTS public.contabilita_imposte_esercizio (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio integer NOT NULL CHECK (esercizio BETWEEN 2000 AND 2100),
  ires numeric(14,2) NOT NULL DEFAULT 0 CHECK (ires >= 0),
  irap numeric(14,2) NOT NULL DEFAULT 0 CHECK (irap >= 0),
  created_by uuid DEFAULT auth.uid(),
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, esercizio)
);
COMMENT ON TABLE public.contabilita_imposte_esercizio IS 'IRES e IRAP di competenza dell''esercizio, stanziate al 31/12 da contabilita_imposte.';
ALTER TABLE public.contabilita_imposte_esercizio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contabilita_imposte_esercizio FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contabilita_imposte_esercizio FROM authenticated;
GRANT SELECT ON public.contabilita_imposte_esercizio TO authenticated;
-- permesso contabilita_imposte_esercizio: la legge chi legge la contabilità; la scrive contabilita_imposte.
DROP POLICY IF EXISTS contabilita_imposte_esercizio_lettura ON public.contabilita_imposte_esercizio;
CREATE POLICY contabilita_imposte_esercizio_lettura ON public.contabilita_imposte_esercizio FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));

CREATE OR REPLACE FUNCTION public.contabilita_imposte(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true,
  p_ires numeric DEFAULT NULL, p_irap numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('imposte:' || p_company || ':' || p_anno)::uuid;
  v_ires numeric; v_irap numeric; v_acconti numeric; v_usati numeric; v_righe jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_vecchia public.contabilita_scritture; v_registrata boolean; v_da_aggiornare boolean := false; x text;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_ires, 0) < 0 OR coalesce(p_irap, 0) < 0 THEN RAISE EXCEPTION 'Le imposte non sono negative' USING ERRCODE = '22023'; END IF;
  -- Una registrazione alla volta per azienda.
  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0)); END IF;

  IF NOT p_anteprima AND (p_ires IS NOT NULL OR p_irap IS NOT NULL) THEN
    INSERT INTO public.contabilita_imposte_esercizio (company_id, esercizio, ires, irap)
    VALUES (p_company, p_anno, round(coalesce(p_ires, 0), 2), round(coalesce(p_irap, 0), 2))
    ON CONFLICT (company_id, esercizio) DO UPDATE SET ires = EXCLUDED.ires, irap = EXCLUDED.irap, aggiornato_il = now(), created_by = auth.uid();
  END IF;
  SELECT ires, irap INTO v_ires, v_irap FROM public.contabilita_imposte_esercizio WHERE company_id = p_company AND esercizio = p_anno;

  -- Gli acconti IRES e IRAP versati nell'anno (righe a debito degli F24 pagati).
  SELECT coalesce(sum(importo), 0) INTO v_acconti FROM public.f24_entries
   WHERE company_id = p_company AND stato = 'pagato' AND tributo_code IN ('2001', '2002', '3812', '3813')
     AND data_pagamento BETWEEN make_date(p_anno, 1, 1) AND make_date(p_anno, 12, 31) AND importo > 0;

  IF coalesce(v_ires, 0) + coalesce(v_irap, 0) > 0 THEN
    v_usati := least(v_acconti, v_ires + v_irap);
    FOREACH x IN ARRAY ARRAY['50.01', '13.13'] || CASE WHEN v_usati > 0 THEN ARRAY['05.12'] ELSE ARRAY[]::text[] END LOOP
      IF NOT k ? x THEN v_mancano := array_append(v_mancano, x); END IF;
    END LOOP;
    IF cardinality(v_mancano) = 0 THEN
      v_righe := public.contabilita_riga(k->>'50.01', 'dare', v_ires, 'IRES dell''esercizio')
              || public.contabilita_riga(k->>'50.01', 'dare', v_irap, 'IRAP dell''esercizio')
              || public.contabilita_riga(k->>'05.12', 'avere', v_usati, 'acconti versati')
              || public.contabilita_riga(k->>'13.13', 'avere', v_ires + v_irap - v_usati, 'saldo da versare');
    END IF;
  END IF;

  SELECT s.* INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'imposte' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;
  v_da_aggiornare := v_registrata AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno, nel riquadro dei conti da usare)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF (NOT v_registrata AND jsonb_array_length(v_righe) > 0) OR v_da_aggiornare THEN
      IF v_registrata THEN
        PERFORM public.contabilita_storna_viva(p_company, 'imposte', v_id, 'Imposte dell''esercizio cambiate');
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Imposte dell''esercizio',
          'IRES e IRAP di competenza ' || p_anno, NULL, NULL, v_righe, 'imposte', v_id, NULL);
      END IF;
      v_registrata := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('ires', v_ires, 'irap', v_irap, 'acconti', v_acconti, 'acconti_usati', coalesce(v_usati, 0),
    'da_versare', greatest(coalesce(v_ires, 0) + coalesce(v_irap, 0) - v_acconti, 0),
    'a_credito', greatest(v_acconti - coalesce(v_ires, 0) - coalesce(v_irap, 0), 0),
    'registrata', v_registrata, 'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_imposte(uuid, int, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_imposte(uuid, int, boolean, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_genera_da_documenti(p_company uuid, p_anno integer, p_solo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $$
DECLARE
  k jsonb;
  v_dal date := make_date(p_anno, 1, 1);
  v_al date := make_date(p_anno, 12, 31);
  e record; r record; v_righe jsonb; v_nc boolean; v_conto text; v_causale text; v_origine text;
  n_em int := 0; n_ric int := 0; n_inc int := 0; n_pag int := 0; n_alt int := 0;
  s_testata int := 0; s_gia int := 0; s_errori jsonb := '[]'::jsonb;
  v_avvisi jsonb := '[]'::jsonb; v_da_verificare text; v_dif_conto text; v_n6 boolean; v_rc_imp numeric; v_rc_iva numeric; v_rc_detr numeric; v_cat text; v_sconto numeric; v_conto_sconto text;
  imp numeric; iva numeric; tot numeric; dif numeric; rit numeric; netto numeric; v_split boolean;
  v_ricavo_altro text; v_costo_altro text; v_indetraibile numeric; v_banca text; v_contro text; n_mov int := 0; s_giro int := 0; v_cedolini boolean; n_ced int := 0; v_viva public.contabilita_scritture; v_f24 jsonb; v_trib record; n_rif int := 0; v_banca_f24 numeric;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;
  -- Due generazioni insieme non registrano due volte lo stesso documento.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));

  SELECT coalesce(jsonb_object_agg(chiave, id), '{}'::jsonb) INTO k FROM (
    SELECT DISTINCT ON (chiave) chiave, id FROM (
      SELECT coalesce(codice_standard, codice) AS chiave, id, codice_standard IS NOT NULL AS esplicito, codice
        FROM public.contabilita_conti WHERE company_id = p_company AND movimentabile AND attivo
    ) x ORDER BY chiave, esplicito DESC, codice
  ) y;
  IF NOT (k ? '05.01' AND k ? '20.01' AND k ? '13.10' AND k ? '05.10' AND k ? '13.04' AND k ? '06.01' AND k ? '30.01') THEN
    RAISE EXCEPTION 'Mancano i conti per clienti, fornitori, banca, IVA, ricavi e acquisti (05.01, 05.10, 06.01, 13.04, 13.10, 20.01, 30.01): carica il piano standard o indica a quali conti corrispondono' USING ERRCODE = '22023';
  END IF;
  -- Con i cedolini in contabilità il costo del personale nasce lì: stipendi pagati e F24
  -- di ritenute e contributi chiudono i debiti verso dipendenti, Erario e INPS.
  v_cedolini := EXISTS (SELECT 1 FROM public.hr_cedolini h WHERE h.company_id = p_company AND h.anno = p_anno AND h.stato IN ('emesso', 'pagato'));
  v_ricavo_altro := CASE WHEN k ? '20.04' THEN '20.04' ELSE '20.01' END;
  v_costo_altro := CASE WHEN k ? '30.40' THEN '30.40' ELSE '30.01' END;
  -- Dove va quello che il programma non sa classificare: un conto da guardare, non un ricavo o un costo.
  v_da_verificare := CASE WHEN k ? '13.90' THEN '13.90' END;

  -- Tutti i fatti dell'esercizio, in ordine di data: così anche i numeri seguono il calendario.
  FOR e IN SELECT * FROM (
  SELECT 'emessa', v.id, v.data_emissione, 1 FROM public.fatture_vendite_iva v
   WHERE v.company_id = p_company AND v.deleted_at IS NULL AND v.data_emissione BETWEEN v_dal AND v_al
     AND v.tipo IN ('fattura', 'fattura_pa', 'fattura_riepilogativa', 'fattura_accompagnatoria', 'parcella', 'nota_credito', 'nota_debito')
     AND coalesce(v.stato, '') NOT IN ('bozza', 'annullata', 'stornata', 'draft', 'cancelled', 'canceled', 'void', 'deleted', 'rifiutata', 'scartata')
  UNION ALL
  SELECT 'ricevuta', f.id, f.data_fattura, 2 FROM public.fatture_ricevute f
   WHERE f.company_id = p_company AND f.stato <> 'rifiutata' AND f.data_fattura BETWEEN v_dal AND v_al
  UNION ALL
  SELECT 'incasso', p.id, p.payment_date, 3 FROM public.invoice_payments p
   WHERE p.company_id = p_company AND p.payment_date BETWEEN v_dal AND v_al AND p.amount <> 0
     -- Le fatture native hanno gli incassi nella prima nota del documento: qui sarebbero doppi.
     AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali d WHERE d.id = p.invoice_id)
  UNION ALL
  SELECT 'incasso_fattura', i.id, coalesce(i.payment_date, i.due_date, i.issue_date), 3 FROM public.invoices i
   WHERE i.company_id = p_company AND i.deleted_at IS NULL AND i.document_type IN ('invoice', 'credit_note')
     -- Anche le fatture tornate a zero: un incasso registrato e poi tolto va stornato.
     AND (coalesce(i.paid_amount, 0) > 0 OR EXISTS (SELECT 1 FROM public.contabilita_scritture s
            WHERE s.company_id = p_company AND s.origine = 'incasso_fattura' AND s.origine_id = i.id))
     AND coalesce(i.payment_date, i.due_date, i.issue_date) BETWEEN v_dal AND v_al
     AND NOT EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali d WHERE d.id = i.id)
  UNION ALL
  SELECT 'incasso_documento', pn.id, pn.entry_date, 3 FROM public.prima_nota_entries pn
   WHERE pn.company_id = p_company AND pn.documento_fiscale_id IS NOT NULL AND pn.entry_date BETWEEN v_dal AND v_al AND pn.amount <> 0
  UNION ALL
  SELECT 'ritenuta_subita', d.id, coalesce((d.pagato_at AT TIME ZONE 'Europe/Rome')::date, d.data_emissione), 4 FROM public.documenti_fiscali d
   WHERE d.company_id = p_company AND d.deleted_at IS NULL AND d.stato = 'pagata' AND coalesce(d.ritenuta_importo, 0) > 0
     AND coalesce((d.pagato_at AT TIME ZONE 'Europe/Rome')::date, d.data_emissione) BETWEEN v_dal AND v_al
  UNION ALL
  SELECT 'pagamento', f.id, f.pagata_il, 4 FROM public.fatture_ricevute f
   WHERE f.company_id = p_company AND f.pagata_il BETWEEN v_dal AND v_al AND f.stato <> 'rifiutata'
     AND f.tipo_documento NOT IN ('TD04', 'TD08', 'TD16', 'passive_credit_note')
     -- Pagata dalla prima nota (pagamento del costo): lì c'è ogni versamento, con la sua data.
     AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.company_id = p_company AND pn.cost_id = f.company_cost_id AND f.company_cost_id IS NOT NULL
                    AND pn.invoice_id IS NULL AND pn.documento_fiscale_id IS NULL)
     AND coalesce(f.totale_documento, 0) > 0
  UNION ALL
  -- Movimenti di prima nota che nessun documento racconta già: pagamenti dei costi, stipendi,
  -- F24, incassi e uscite senza fattura. Fuori gli incassi delle fatture (registro pagamenti e
  -- prima nota del documento) e i movimenti ricostruiti dagli F24 registrati a parte.
  SELECT 'prima_nota', pn.id, pn.entry_date, 5 FROM public.prima_nota_entries pn
   WHERE pn.company_id = p_company AND pn.entry_date BETWEEN v_dal AND v_al AND pn.amount <> 0
     AND pn.documento_fiscale_id IS NULL AND pn.invoice_id IS NULL
     -- Un movimento «sciolto» che ha la sua gemella sul documento (stessa data, stesso importo:
     -- pagata_il della fattura ricevuta, incasso della fattura emessa) è lo stesso soldo due volte.
     AND NOT (pn.cost_id IS NULL AND pn.direction = 'uscita' AND EXISTS (
           SELECT 1 FROM public.fatture_ricevute f WHERE f.company_id = p_company AND f.pagata_il = pn.entry_date
              AND (abs(coalesce(f.netto_a_pagare, f.totale_documento) - pn.amount) < 0.01
                OR abs(f.totale_documento - coalesce(f.ritenuta_importo, 0) - coalesce(f.trattenuta_garanzia, 0) - pn.amount) < 0.01)))
     AND NOT (pn.direction = 'entrata' AND EXISTS (
           SELECT 1 FROM public.invoices i WHERE i.company_id = p_company AND i.deleted_at IS NULL
              AND coalesce(i.payment_date, i.due_date, i.issue_date) = pn.entry_date AND abs(i.paid_amount - pn.amount) < 0.01
           UNION ALL
           SELECT 1 FROM public.invoice_payments ip WHERE ip.company_id = p_company AND ip.payment_date = pn.entry_date AND abs(ip.amount - pn.amount) < 0.01))
  UNION ALL
  -- I cedolini del mese, tutti insieme: costo del personale e debiti che nascono.
  SELECT 'cedolini', md5('cedolini:' || p_company || ':' || h.anno || ':' || h.mese)::uuid,
         (make_date(h.anno, h.mese, 1) + interval '1 month - 1 day')::date, 5
    FROM public.hr_cedolini h
   WHERE h.company_id = p_company AND h.anno = p_anno AND h.stato IN ('emesso', 'pagato')
   GROUP BY h.anno, h.mese
  UNION
  SELECT 'cedolini', s.origine_id, s.data_registrazione, 5 FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'cedolini' AND s.esercizio = p_anno
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
  UNION ALL
  SELECT 'f24', f.id, f.data_pagamento, 5 FROM public.f24_entries f
   WHERE f.company_id = p_company AND f.stato = 'pagato' AND f.data_pagamento BETWEEN v_dal AND v_al AND coalesce(f.importo, 0) <> 0
     -- Lo stesso versamento già in prima nota (stesso giorno, stesso importo): conta lì.
     AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.company_id = p_company AND pn.direction = 'uscita'
                      AND pn.entry_date = f.data_pagamento AND pn.cost_id IS NULL
                      AND (abs(pn.amount - f.importo) < 0.01
                           -- Con più righe dello stesso importo il movimento ne copre una sola, la prima.
                           AND f.id = (SELECT h.id FROM public.f24_entries h WHERE h.company_id = p_company AND h.stato = 'pagato'
                                        AND h.data_pagamento = f.data_pagamento AND abs(h.importo - pn.amount) < 0.01 ORDER BY h.id LIMIT 1)
                        -- Un solo movimento per tutto l'F24 del giorno (più tributi): conta lì, diviso per tributo.
                        OR abs(pn.amount - (SELECT sum(g.importo) FROM public.f24_entries g WHERE g.company_id = p_company
                                              AND g.stato = 'pagato' AND g.data_pagamento = f.data_pagamento)) < 0.01))
  UNION ALL
  -- Scritture vive il cui documento non c'è più (annullato, rifiutato, cancellato, pagamento tolto):
  -- si stornano. L'id è quello della scrittura; con p_solo si guarda il documento.
  SELECT 'sparita', s.id, s.data_registrazione, 0 FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.esercizio = p_anno
     AND s.origine IN ('fattura_emessa', 'fattura_ricevuta', 'pagamento', 'incasso', 'prima_nota')
     AND (p_solo IS NULL OR s.origine_id = p_solo)
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
     AND NOT CASE s.origine
       WHEN 'fattura_emessa' THEN EXISTS (SELECT 1 FROM public.fatture_vendite_iva v WHERE v.id = s.origine_id AND v.company_id = p_company
              AND v.deleted_at IS NULL
              AND v.tipo IN ('fattura', 'fattura_pa', 'fattura_riepilogativa', 'fattura_accompagnatoria', 'parcella', 'nota_credito', 'nota_debito')
              AND coalesce(v.stato, '') NOT IN ('bozza', 'annullata', 'stornata', 'draft', 'cancelled', 'canceled', 'void', 'deleted', 'rifiutata', 'scartata'))
       WHEN 'fattura_ricevuta' THEN EXISTS (SELECT 1 FROM public.fatture_ricevute f WHERE f.id = s.origine_id AND f.company_id = p_company AND f.stato <> 'rifiutata')
       WHEN 'pagamento' THEN EXISTS (SELECT 1 FROM public.fatture_ricevute f WHERE f.id = s.origine_id AND f.company_id = p_company
              AND f.pagata_il IS NOT NULL AND f.stato <> 'rifiutata')
       WHEN 'incasso' THEN EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.id = s.origine_id AND p.company_id = p_company AND p.amount <> 0)
       WHEN 'prima_nota' THEN EXISTS (SELECT 1 FROM public.prima_nota_entries pn WHERE pn.id = s.origine_id AND pn.company_id = p_company AND pn.amount <> 0)
     END
  ) ev(tipo, id, data, ordine)
  WHERE p_solo IS NULL OR ev.id = p_solo OR ev.tipo = 'sparita'
  ORDER BY ev.data, ev.ordine, ev.id
  LOOP
    v_origine := CASE e.tipo WHEN 'emessa' THEN 'fattura_emessa' WHEN 'ricevuta' THEN 'fattura_ricevuta' ELSE e.tipo END;
    IF e.tipo NOT IN ('cedolini', 'incasso_fattura', 'emessa', 'ricevuta', 'sparita') AND public.contabilita_documento_registrato(p_company, v_origine, e.id) THEN
      s_gia := s_gia + 1;
      -- Un movimento già registrato su «Partite da verificare» resta da guardare a ogni giro, finché non si classifica.
      IF e.tipo = 'prima_nota' AND v_da_verificare IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.contabilita_scritture s JOIN public.contabilita_righe rr ON rr.scrittura_id = s.id
            WHERE s.company_id = p_company AND s.origine = 'prima_nota' AND s.origine_id = e.id AND rr.conto_id = (k->>v_da_verificare)::uuid
              AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)) THEN
        v_avvisi := v_avvisi || to_jsonb(format('Movimento di prima nota del %s: è su «Partite da verificare», va classificato.', to_char(e.data, 'DD/MM/YYYY')));
      END IF;
      CONTINUE;
    END IF;
    v_righe := '[]'::jsonb;
    BEGIN
      IF e.tipo = 'emessa' THEN
        SELECT * INTO r FROM public.fatture_vendite_iva WHERE id = e.id AND company_id = p_company;
        IF r.imponibile_totale IS NULL OR r.totale_documento IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Importi con segno: positivi = fattura, negativi = nota di credito (anche riga per riga).
        imp := r.imponibile_totale; iva := coalesce(r.iva_totale, 0); tot := r.totale_documento;
        -- Nota di credito: ogni importo col suo segno, anche se arriva positivo o misto (Fatture in Cloud).
        IF r.tipo = 'nota_credito' THEN imp := -abs(imp); iva := -abs(iva); tot := -abs(tot); END IF;
        v_nc := imp + iva < 0;
        -- Split payment: dichiarato sul documento, oppure fattura alla PA (codice destinatario di 6
        -- caratteri) importata, dove l'esigibilità non arriva.
        v_split := coalesce(r.esigibilita_iva, 'I') = 'S'
          OR (iva <> 0 AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = e.id AND btrim(coalesce(i.client_sdi_code, '')) ~ '^[A-Z0-9]{6}$'));
        IF v_split THEN tot := tot - iva; iva := 0; END IF;  -- il cliente paga senza IVA, la versa l'ente
        dif := round(tot - imp - iva, 2);
        IF imp = 0 AND iva = 0 AND tot = 0 THEN CONTINUE; END IF;
        -- Solo il totale, senza imponibile né IVA: non si sa cosa sia. Non si registra (e se c'era, si storna).
        IF imp = 0 AND iva = 0 THEN
          PERFORM public.contabilita_storna_viva(p_company, v_origine, e.id, 'Documento senza imponibile né IVA: da completare');
          s_testata := s_testata + 1;
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: c''è solo il totale (%s €), senza imponibile né IVA. Non è nel giornale.',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), tot));
          CONTINUE;
        END IF;
        -- La differenza fra totale e imponibile più IVA: il bollo (2 €) e i centesimi sono altri ricavi;
        -- oltre 1 € è da guardare (acconti, sconti, spese) e va su «Partite da verificare».
        v_dif_conto := v_ricavo_altro;
        IF abs(dif) > 1 AND abs(abs(dif) - 2) >= 0.005 AND v_da_verificare IS NOT NULL THEN
          v_dif_conto := v_da_verificare;
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: %s € fra totale e imponibile più IVA, su «Partite da verificare».',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), dif));
        ELSIF abs(dif) > 1 AND abs(abs(dif) - 2) >= 0.005 THEN
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: %s € fra totale e imponibile più IVA, messi fra gli altri ricavi (manca il conto «Partite da verificare», 13.90).',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), dif));
        END IF;
        -- Sconto in fattura dei bonus edilizi (art. 121): la riga negativa non abbassa il ricavo, è un
        -- credito d'imposta che l'azienda userà in compensazione negli F24 o cederà.
        SELECT coalesce(sum(abs(l.line_net)), 0) INTO v_sconto FROM public.invoice_lines l
         WHERE l.invoice_id = e.id AND l.line_net < 0 AND l.description ~* '(sconto in fattura|art\.? ?121|cessione del credito)';
        IF v_nc THEN v_sconto := -v_sconto; END IF;
        v_conto_sconto := CASE WHEN k ? '05.13' THEN '05.13' WHEN k ? '05.12' THEN '05.12' ELSE v_da_verificare END;
        IF v_sconto <> 0 AND v_conto_sconto IS NULL THEN
          v_avvisi := v_avvisi || to_jsonb(format('Fattura emessa %s del %s: sconto in fattura di %s € lasciato a riduzione del ricavo (manca il conto dei crediti d''imposta).',
            r.numero, to_char(r.data_emissione, 'DD/MM/YYYY'), v_sconto));
          v_sconto := 0;
        END IF;
        v_righe := public.contabilita_riga(k->>'05.01', 'dare', tot, r.cliente_snapshot->>'ragione_sociale')
                || public.contabilita_riga(k->>v_conto_sconto, 'dare', v_sconto, 'credito d''imposta da sconto in fattura')
                || public.contabilita_riga(k->>'20.01', 'avere', imp + v_sconto, NULL)
                || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL)
                || public.contabilita_riga(k->>v_dif_conto, 'avere', dif, CASE WHEN v_dif_conto = v_da_verificare THEN 'differenza da verificare'
                     WHEN dif * sign(tot) > 0 THEN 'bollo e spese fuori imponibile' ELSE 'arrotondamenti e abbuoni' END);
        v_causale := CASE WHEN v_nc THEN 'Nota di credito emessa' WHEN v_split THEN 'Fattura emessa (split payment)' ELSE 'Fattura emessa' END;
        -- Già registrata: se il documento è cambiato dopo (importi, conto, righe) si storna e si rifà.
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = v_origine AND s.origine_id = e.id
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_viva.id IS NOT NULL THEN
          IF public.contabilita_righe_uguali(v_viva.id, v_righe) THEN s_gia := s_gia + 1; CONTINUE; END IF;
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Documento cambiato dopo la registrazione', v_viva.documento_numero, v_viva.documento_data,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_viva.id), 'storno', v_viva.id, v_viva.id);
          n_rif := n_rif + 1;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, r.data_emissione), v_causale, r.cliente_snapshot->>'ragione_sociale',
          r.numero, r.data_emissione, v_righe, v_origine, e.id, NULL);
        n_em := n_em + 1;

      ELSIF e.tipo = 'ricevuta' THEN
        SELECT f.*, c.category INTO r FROM public.fatture_ricevute f LEFT JOIN public.company_costs c ON c.id = f.company_cost_id WHERE f.id = e.id;
        IF r.imponibile_totale IS NULL OR r.iva_totale IS NULL THEN s_testata := s_testata + 1; CONTINUE; END IF;
        imp := r.imponibile_totale; iva := r.iva_totale; tot := coalesce(r.totale_documento, r.imponibile_totale + r.iva_totale);
        -- Nota di credito (anche quelle di Fatture in Cloud): ogni importo col suo segno.
        IF r.tipo_documento IN ('TD04', 'TD08', 'passive_credit_note') THEN imp := -abs(imp); iva := -abs(iva); tot := -abs(tot); END IF;
        v_nc := imp + iva < 0;
        IF imp = 0 AND iva = 0 THEN
          IF coalesce(tot, 0) <> 0 THEN
            PERFORM public.contabilita_storna_viva(p_company, v_origine, e.id, 'Documento senza imponibile né IVA: da completare');
            s_testata := s_testata + 1;
            v_avvisi := v_avvisi || to_jsonb(format('Fattura ricevuta %s del %s: c''è solo il totale (%s €), senza imponibile né IVA. Non è nel giornale.',
              r.numero_fattura, to_char(r.data_fattura, 'DD/MM/YYYY'), tot));
          END IF;
          CONTINUE;
        END IF;
        -- Reverse charge interno (edilizia, N6.x) senza la sua integrazione TD16: l'IVA si integra qui.
        SELECT coalesce(sum(coalesce(nullif(x->>'imponibile', '')::numeric, 0)), 0) INTO v_rc_imp
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.righe) = 'array' THEN r.righe ELSE '[]'::jsonb END) x
         WHERE x->>'natura_iva' LIKE 'N6%';
        IF v_rc_imp = 0 THEN
          SELECT coalesce(sum(coalesce(nullif(x->>'imponibile', '')::numeric, 0)), 0) INTO v_rc_imp
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.riepilogo_iva) = 'array' THEN r.riepilogo_iva ELSE '[]'::jsonb END) x
           WHERE x->>'natura' LIKE 'N6%';
        END IF;
        v_rc_imp := abs(v_rc_imp) * CASE WHEN v_nc THEN -1 ELSE 1 END;
        v_n6 := v_rc_imp <> 0 AND r.tipo_documento NOT IN ('TD16', 'TD17', 'TD18', 'TD19', 'self_invoice')
          AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute g WHERE g.company_id = p_company AND g.tipo_documento = 'TD16'
                            AND g.cedente_piva IS NOT DISTINCT FROM r.cedente_piva AND abs(abs(g.imponibile_totale) - abs(v_rc_imp)) < 0.01);
        IF r.tipo_documento = 'TD16' OR (r.tipo_documento = 'self_invoice' AND EXISTS (
             -- Autofattura di cui c'è anche la fattura del fornitore: costo e debito vengono da quella.
             SELECT 1 FROM public.fatture_ricevute g WHERE g.company_id = p_company AND g.id <> r.id AND g.tipo_documento <> 'self_invoice'
                AND g.cedente_piva IS NOT DISTINCT FROM r.cedente_piva AND abs(abs(g.imponibile_totale) - abs(imp)) < 0.01
                AND abs(g.data_fattura - r.data_fattura) <= 31)) THEN
          -- Reverse charge interno: il costo e il debito verso il fornitore vengono dalla sua fattura.
          IF iva = 0 THEN CONTINUE; END IF;
          v_righe := public.contabilita_riga(k->>'05.10', 'dare', iva, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL);
          v_causale := CASE WHEN r.tipo_documento = 'TD16' THEN 'Integrazione IVA reverse charge (TD16)' ELSE 'Integrazione IVA (autofattura)' END;
        ELSE
          v_cat := coalesce(r.category, r.categoria_ai);
          -- Senza categoria, una fattura in reverse charge edile è un subappalto.
          v_conto := public.contabilita_ruolo_disponibile(k, CASE WHEN v_cat IS NULL AND v_n6 THEN '30.02' ELSE public.contabilita_conto_da_categoria(v_cat) END);
          -- IVA detraibile solo in parte (detraibilita_percentuale): la quota indetraibile è costo.
          v_indetraibile := round(iva * (100 - least(100, greatest(0, coalesce(r.detraibilita_percentuale, 100)))) / 100, 2);
          -- Il costo si divide per conto, riga per riga (conti_righe); il resto sul conto della fattura.
          v_righe := public.contabilita_righe_costo(k, r.righe, r.conti_righe, imp, v_indetraibile, v_conto, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>'05.10', 'dare', iva - v_indetraibile, NULL);
          IF r.tipo_documento IN ('TD17', 'TD18', 'TD19', 'self_invoice') AND iva <> 0 THEN
            -- Integrazione estera e autofattura: il fornitore è debitore del solo imponibile, l'IVA va anche fra i debiti.
            v_righe := v_righe || public.contabilita_riga(k->>'13.04', 'avere', imp, r.cedente_ragione_sociale)
                               || public.contabilita_riga(k->>'13.10', 'avere', iva, NULL);
            v_causale := 'Integrazione reverse charge';
          ELSE
            -- Qualche fornitore scrive il totale già al netto della ritenuta d'acconto: il debito verso di
            -- lui è comunque imponibile più IVA (la ritenuta si toglie al pagamento, verso l'Erario), e
            -- la differenza non è un abbuono.
            IF coalesce(r.ritenuta_importo, 0) > 0 AND abs(tot - imp - iva + r.ritenuta_importo * sign(tot)) < 0.02 THEN
              tot := imp + iva;
            END IF;
            dif := round(tot - imp - iva, 2);
            -- La differenza: bollo e centesimi sono oneri diversi; la cassa previdenziale fuori imponibile
            -- è costo della fattura; il resto oltre 1 € va su «Partite da verificare».
            v_dif_conto := v_costo_altro;
            IF abs(dif) > 1 AND abs(abs(dif) - abs(coalesce(r.bollo_importo, 0))) >= 0.01 THEN
              IF coalesce(r.cassa_previdenziale, 0) <> 0 AND (abs(abs(dif) - abs(r.cassa_previdenziale)) < 0.02
                   OR abs(abs(dif) - round(abs(r.cassa_previdenziale) * 1.22, 2)) < 0.02) THEN
                v_dif_conto := v_conto;
              ELSIF v_da_verificare IS NOT NULL THEN
                v_dif_conto := v_da_verificare;
                v_avvisi := v_avvisi || to_jsonb(format('Fattura ricevuta %s del %s: %s € fra totale e imponibile più IVA, su «Partite da verificare».',
                  r.numero_fattura, to_char(r.data_fattura, 'DD/MM/YYYY'), dif));
              ELSE
                v_avvisi := v_avvisi || to_jsonb(format('Fattura ricevuta %s del %s: %s € fra totale e imponibile più IVA, messi fra gli oneri diversi (manca il conto «Partite da verificare», 13.90).',
                  r.numero_fattura, to_char(r.data_fattura, 'DD/MM/YYYY'), dif));
              END IF;
            END IF;
            v_righe := v_righe || public.contabilita_riga(k->>'13.04', 'avere', tot, r.cedente_ragione_sociale)
                               || public.contabilita_riga(k->>v_dif_conto, 'dare', dif, CASE WHEN v_dif_conto = v_da_verificare THEN 'differenza da verificare'
                                    WHEN v_dif_conto = v_conto THEN 'cassa previdenziale' WHEN dif * sign(tot) > 0 THEN 'bollo e spese fuori imponibile' ELSE 'arrotondamenti e abbuoni' END);
            v_causale := CASE WHEN v_nc THEN 'Nota di credito ricevuta' ELSE 'Fattura ricevuta' END;
            IF v_n6 THEN
              -- Reverse charge edile: l'IVA si integra (a debito e, per la parte detraibile, a credito).
              v_rc_iva := round(v_rc_imp * 22 / 100, 2);
              v_rc_detr := round(v_rc_iva * least(100, greatest(0, coalesce(r.detraibilita_percentuale, 100))) / 100, 2);
              v_righe := v_righe || public.contabilita_riga(k->>'05.10', 'dare', v_rc_detr, 'IVA reverse charge integrata')
                                 || public.contabilita_riga(k->>v_conto, 'dare', v_rc_iva - v_rc_detr, 'IVA reverse charge indetraibile')
                                 || public.contabilita_riga(k->>'13.10', 'avere', v_rc_iva, 'IVA reverse charge integrata');
              v_causale := CASE WHEN v_nc THEN 'Nota di credito ricevuta (reverse charge)' ELSE 'Fattura ricevuta (reverse charge)' END;
            END IF;
          END IF;
        END IF;
        -- Già registrata: se il documento è cambiato dopo (importi, conto, righe) si storna e si rifà.
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = v_origine AND s.origine_id = e.id
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_viva.id IS NOT NULL THEN
          IF public.contabilita_righe_uguali(v_viva.id, v_righe) THEN s_gia := s_gia + 1; CONTINUE; END IF;
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Documento cambiato dopo la registrazione', v_viva.documento_numero, v_viva.documento_data,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_viva.id), 'storno', v_viva.id, v_viva.id);
          n_rif := n_rif + 1;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, r.data_fattura), v_causale, r.cedente_ragione_sociale,
          r.numero_fattura, r.data_fattura, v_righe, v_origine, e.id, NULL);
        n_ric := n_ric + 1;

      ELSIF e.tipo = 'incasso' THEN
        SELECT p.amount, p.payment_date, p.invoice_id, i.invoice_number, i.client_company_name, i.document_type INTO r
          FROM public.invoice_payments p JOIN public.invoices i ON i.id = p.invoice_id WHERE p.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', r.invoice_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Su una nota di credito il «pagamento» è un rimborso al cliente.
        tot := CASE WHEN r.document_type IN ('credit_note', 'TD04', 'TD08') THEN -r.amount ELSE r.amount END;
        v_righe := public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)
                || public.contabilita_riga(k->>'05.01', 'avere', tot, r.client_company_name);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, r.payment_date),
          CASE WHEN tot < 0 THEN 'Rimborso nota di credito' ELSE 'Incasso fattura' END, r.client_company_name,
          r.invoice_number, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'incasso_fattura' THEN
        SELECT i.paid_amount, i.invoice_number, i.client_company_name, i.document_type INTO r FROM public.invoices i WHERE i.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Nota di credito «pagata»: rimborsata o compensata, in ogni caso esce dal credito verso il cliente.
        tot := CASE WHEN r.document_type = 'credit_note' THEN -coalesce(r.paid_amount, 0) ELSE coalesce(r.paid_amount, 0) END;
        -- Fattura alla PA in split payment: l'ente paga il solo imponibile, anche se l'import la segna
        -- pagata per intero (l'IVA la versa lui all'Erario).
        IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = e.id AND coalesce(i.tax_amount, 0) <> 0
                     AND btrim(coalesce(i.client_sdi_code, '')) ~ '^[A-Z0-9]{6}$') THEN
          tot := sign(tot) * least(abs(tot), (SELECT abs(i.total) - abs(i.tax_amount) FROM public.invoices i WHERE i.id = e.id));
        END IF;
        -- L'incassato cresce a rate (500, poi altri 500) o torna indietro: si registra la differenza con
        -- quanto è già nel giornale per questa fattura (incassi e loro storni, sul credito verso il cliente).
        tot := tot - coalesce((SELECT sum(rr.avere - rr.dare) FROM public.contabilita_righe rr
                                 JOIN public.contabilita_scritture s ON s.id = rr.scrittura_id
                                WHERE s.company_id = p_company AND rr.conto_id = (k->>'05.01')::uuid
                                  AND ((s.origine = 'incasso_fattura' AND s.origine_id = e.id)
                                    OR (s.origine = 'storno' AND s.storno_di IN (SELECT x.id FROM public.contabilita_scritture x
                                          WHERE x.company_id = p_company AND x.origine = 'incasso_fattura' AND x.origine_id = e.id)))), 0);
        IF abs(tot) < 0.005 THEN s_gia := s_gia + 1; CONTINUE; END IF;
        v_righe := public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)
                || public.contabilita_riga(k->>'05.01', 'avere', tot, r.client_company_name);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data),
          CASE WHEN r.document_type = 'credit_note' AND tot < 0 THEN 'Rimborso nota di credito'
               WHEN r.document_type = 'credit_note' THEN 'Rimborso nota di credito annullato'
               WHEN tot < 0 THEN 'Incasso fattura annullato' ELSE 'Incasso fattura' END, r.client_company_name,
          r.invoice_number, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'incasso_documento' THEN
        SELECT pn.amount, pn.direction, pn.documento_fiscale_id, pn.account_label, d.numero, d.cliente_snapshot->>'ragione_sociale' AS cliente INTO r
          FROM public.prima_nota_entries pn JOIN public.documenti_fiscali d ON d.id = pn.documento_fiscale_id WHERE pn.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', r.documento_fiscale_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        -- Un'uscita legata al documento è l'annullamento di un incasso: va al contrario.
        v_conto := CASE WHEN r.account_label = 'cassa' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;
        v_righe := jsonb_build_array(
          jsonb_build_object('conto_id', k->>v_conto, CASE WHEN r.direction = 'entrata' THEN 'dare' ELSE 'avere' END, abs(r.amount)),
          jsonb_build_object('conto_id', k->>'05.01', CASE WHEN r.direction = 'entrata' THEN 'avere' ELSE 'dare' END, abs(r.amount), 'descrizione', r.cliente));
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data),
          CASE WHEN r.direction = 'entrata' THEN 'Incasso fattura' ELSE 'Annullamento incasso' END, r.cliente,
          r.numero, NULL, v_righe, v_origine, e.id, NULL);
        n_inc := n_inc + 1;

      ELSIF e.tipo = 'ritenuta_subita' THEN
        SELECT d.ritenuta_importo, d.numero, d.cliente_snapshot->>'ragione_sociale' AS cliente INTO r FROM public.documenti_fiscali d WHERE d.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_emessa', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        IF NOT k ? '05.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute subite (ruolo 05.12)'; END IF;
        v_righe := jsonb_build_array(
          jsonb_build_object('conto_id', k->>'05.12', 'dare', r.ritenuta_importo, 'descrizione', 'ritenuta d''acconto subita'),
          jsonb_build_object('conto_id', k->>'05.01', 'avere', r.ritenuta_importo, 'descrizione', r.cliente));
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Ritenuta d''acconto subita', r.cliente,
          r.numero, NULL, v_righe, v_origine, e.id, NULL);
        n_alt := n_alt + 1;

      ELSIF e.tipo = 'pagamento' THEN
        SELECT f.totale_documento, f.netto_a_pagare, f.ritenuta_importo, f.trattenuta_garanzia, f.numero_fattura, f.cedente_ragione_sociale,
               f.tipo_documento, f.imponibile_totale INTO r
          FROM public.fatture_ricevute f WHERE f.id = e.id;
        IF NOT public.contabilita_documento_registrato(p_company, 'fattura_ricevuta', e.id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
        rit := coalesce(r.ritenuta_importo, 0);
        netto := coalesce(r.netto_a_pagare, r.totale_documento - rit - coalesce(r.trattenuta_garanzia, 0));
        -- Integrazione estera: al fornitore si deve l'imponibile, l'IVA è solo in contabilità.
        IF r.tipo_documento IN ('TD17', 'TD18', 'TD19') THEN rit := 0; netto := coalesce(r.imponibile_totale, 0); END IF;
        IF netto <= 0 AND rit <= 0 THEN CONTINUE; END IF;
        IF rit > 0 AND NOT k ? '13.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute da versare (ruolo 13.12)'; END IF;
        v_righe := jsonb_build_array(jsonb_build_object('conto_id', k->>'13.04', 'dare', netto + rit, 'descrizione', r.cedente_ragione_sociale));
        IF netto > 0 THEN v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'06.01', 'avere', netto)); END IF;
        IF rit > 0 THEN v_righe := v_righe || jsonb_build_array(jsonb_build_object('conto_id', k->>'13.12', 'avere', rit, 'descrizione', 'ritenuta d''acconto da versare')); END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Pagamento fornitore', r.cedente_ragione_sociale,
          r.numero_fattura, NULL, v_righe, v_origine, e.id, NULL);
        n_pag := n_pag + 1;

      ELSIF e.tipo = 'prima_nota' THEN
        SELECT pn.*, c.category AS costo_categoria, c.name AS costo_nome, f.id AS fattura_id, f.cedente_ragione_sociale, f.netto_a_pagare,
               f.ritenuta_importo, f.totale_documento AS fattura_totale, f.trattenuta_garanzia, f.tipo_documento, f.imponibile_totale AS fattura_imponibile
          INTO r
          FROM public.prima_nota_entries pn
          LEFT JOIN public.company_costs c ON c.id = pn.cost_id
          LEFT JOIN LATERAL (SELECT * FROM public.fatture_ricevute x WHERE x.company_cost_id = pn.cost_id AND pn.cost_id IS NOT NULL
                                AND x.stato <> 'rifiutata'
                              ORDER BY x.data_fattura LIMIT 1) f ON true
         WHERE pn.id = e.id;
        v_banca := CASE WHEN lower(coalesce(r.account_label, '')) LIKE 'cassa%' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;
        -- Importo con segno dal punto di vista della contropartita: uscita = dare, entrata (anche storno) = avere.
        tot := CASE WHEN r.direction = 'uscita' THEN abs(r.amount) ELSE -abs(r.amount) END;
        IF lower(coalesce(r.category, '')) ~ 'giroconto' THEN s_giro := s_giro + 1; CONTINUE; END IF;
        IF r.fattura_id IS NOT NULL THEN
          -- Pagamento (o storno del pagamento) di una fattura ricevuta: chiude il fornitore.
          IF NOT public.contabilita_documento_registrato(p_company, 'fattura_ricevuta', r.fattura_id) THEN s_testata := s_testata + 1; CONTINUE; END IF;
          IF public.contabilita_documento_registrato(p_company, 'pagamento', r.fattura_id) THEN s_gia := s_gia + 1; CONTINUE; END IF;
          rit := coalesce(r.ritenuta_importo, 0);
          netto := coalesce(r.netto_a_pagare, r.fattura_totale - rit - coalesce(r.trattenuta_garanzia, 0));
          IF r.tipo_documento IN ('TD17', 'TD18', 'TD19') OR coalesce(netto, 0) <= 0 THEN rit := 0; END IF;
          -- La ritenuta segue il pagamento in proporzione: col saldo è tutta versata all'Erario.
          rit := CASE WHEN rit > 0 THEN round(rit * tot / netto, 2) ELSE 0 END;
          IF rit <> 0 AND NOT k ? '13.12' THEN RAISE EXCEPTION 'manca il conto delle ritenute da versare (ruolo 13.12)'; END IF;
          v_righe := public.contabilita_riga(k->>'13.04', 'dare', tot + rit, r.cedente_ragione_sociale)
                  || public.contabilita_riga(k->>v_banca, 'avere', tot, NULL)
                  || public.contabilita_riga(k->>'13.12', 'avere', rit, CASE WHEN rit <> 0 THEN 'ritenuta d''acconto da versare' END);
          v_causale := CASE WHEN tot > 0 THEN 'Pagamento fornitore' ELSE 'Storno pagamento fornitore' END;
          v_contro := r.cedente_ragione_sociale;
        ELSE
          v_contro := coalesce(r.costo_nome, r.description);
          v_conto := CASE
            WHEN v_cedolini AND lower(coalesce(r.category, '')) ~ '(stipend|salari|retribuz)' AND k ? '13.30' THEN '13.30'
            WHEN r.cost_id IS NOT NULL THEN public.contabilita_conto_da_categoria(coalesce(r.costo_categoria, r.category))
            WHEN lower(coalesce(r.category, '')) ~ '(pagamento_fornitore|^fornitor)' THEN '13.04'
            WHEN lower(coalesce(r.category, '')) ~ '^incass' THEN '05.01'
            WHEN r.direction = 'entrata' AND lower(coalesce(r.category, '')) ~ 'client' THEN '05.01'
            -- Credito d'imposta ceduto a una banca: entra il prezzo, esce il credito.
            WHEN r.direction = 'entrata' AND r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ 'cessione (del |dei )?credit' THEN
              CASE WHEN k ? '05.13' THEN '05.13' ELSE '05.12' END
            -- Movimenti che non sono né ricavi né costi: denaro preso o reso in prestito, soci, utili.
            WHEN r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) !~ '(spes[ae]|interess|commission|istruttori)'
                 AND (lower(coalesce(r.category, '')) ~ '(finanziament|mutuo|prestit)'
                 OR lower(coalesce(r.description, '')) ~ '(erogazione|rata)( del| di)? (mutuo|finanziamento|prestito)') THEN '13.02'
            WHEN r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ '(anticipo (su )?fattur|anticipo sbf|\msbf\M)'
                 AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) !~ '(spes[ae]|interess|commission)' THEN '13.01'
            WHEN r.cost_id IS NULL AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ '(versament[oi] (dei |del )?soci|conto capitale|aumento (di )?capitale)' THEN '10.03'
            WHEN r.cost_id IS NULL AND r.direction = 'uscita' AND lower(coalesce(r.category, '') || ' ' || coalesce(r.description, '')) ~ '(dividend|distribuzione (degli )?utili)' THEN '10.04'
            -- Un pagamento di tasse senza il suo F24: il conto dalla descrizione; se non si capisce, da guardare.
            WHEN lower(coalesce(r.category, '')) ~ '(fiscal|f24|tribut|impost|tass)' AND r.cost_id IS NULL THEN
              CASE WHEN lower(coalesce(r.description, '')) ~ '\miva\M' AND k ? '13.11' THEN '13.11'
                   WHEN lower(coalesce(r.description, '')) ~ '(ires|irap|acconto)' AND k ? '05.12' THEN '05.12'
                   WHEN lower(coalesce(r.description, '')) ~ '(ritenut|1040|1001)' AND k ? '13.12' THEN '13.12'
                   WHEN lower(coalesce(r.description, '')) ~ '(inps|contribut|dm10)' AND v_cedolini AND k ? '13.20' THEN '13.20'
                   WHEN lower(coalesce(r.description, '')) ~ '(inps|contribut|dm10)' AND k ? '30.11' THEN '30.11'
                   WHEN v_da_verificare IS NOT NULL THEN v_da_verificare
                   WHEN k ? '13.13' THEN '13.13' WHEN k ? '13.11' THEN '13.11' ELSE '30.40' END
            WHEN r.cost_id IS NOT NULL THEN public.contabilita_conto_da_categoria(coalesce(r.costo_categoria, r.category))
            -- Un'entrata che non si sa cosa sia non è un ricavo: si guarda.
            WHEN r.direction = 'entrata' THEN coalesce(v_da_verificare, v_ricavo_altro)
            WHEN lower(coalesce(r.category, '')) IN ('', 'altro', 'altre') THEN v_costo_altro
            ELSE public.contabilita_conto_da_categoria(r.category)
          END;
          IF NOT k ? v_conto THEN
            IF v_conto IN ('13.02', '13.01', '10.03', '10.04') THEN
              v_avvisi := v_avvisi || to_jsonb(format('Movimento del %s (%s €): serve il conto %s nel piano, registrato su %s.',
                to_char(r.entry_date, 'DD/MM/YYYY'), abs(r.amount), v_conto, coalesce(v_da_verificare, 'altri ricavi/oneri diversi')));
            END IF;
            v_conto := coalesce(v_da_verificare, CASE WHEN r.direction = 'entrata' THEN v_ricavo_altro ELSE v_costo_altro END);
          END IF;
          IF v_conto = v_da_verificare OR (v_da_verificare IS NULL AND r.direction = 'entrata' AND v_conto = v_ricavo_altro AND r.cost_id IS NULL
               AND lower(coalesce(r.category, '')) !~ '(ricav|vendit|rimbors|interess|contribut)') THEN
            v_avvisi := v_avvisi || to_jsonb(format('Movimento di prima nota del %s (%s €, «%s»): %s, va classificato.',
              to_char(r.entry_date, 'DD/MM/YYYY'), abs(r.amount), coalesce(r.description, r.category, ''),
              CASE WHEN v_conto = v_da_verificare THEN 'su «Partite da verificare»' ELSE 'messo fra gli altri ricavi (manca il conto «Partite da verificare», 13.90)' END));
          END IF;
          v_righe := public.contabilita_riga(k->>v_conto, 'dare', tot, v_contro)
                  || public.contabilita_riga(k->>v_banca, 'avere', tot, NULL);
          -- Il movimento paga un F24 registrato (stesso giorno, l'importo di un tributo o di tutto
          -- l'F24 del giorno): ogni tributo va sul suo conto, come se l'F24 si registrasse da sé.
          IF r.direction = 'uscita' AND r.cost_id IS NULL THEN
            SELECT jsonb_agg(jsonb_build_object('id', g.id, 't', g.tributo_code, 'd', g.tributo_descrizione, 'i', g.importo) ORDER BY g.tributo_code, g.id) INTO v_f24
              FROM public.f24_entries g
             WHERE g.company_id = p_company AND g.stato = 'pagato' AND g.data_pagamento = r.entry_date AND coalesce(g.importo, 0) <> 0
               AND (abs((SELECT sum(h.importo) FROM public.f24_entries h WHERE h.company_id = p_company AND h.stato = 'pagato'
                           AND h.data_pagamento = r.entry_date) - abs(r.amount)) < 0.01
                 OR g.id = (SELECT h.id FROM public.f24_entries h WHERE h.company_id = p_company AND h.stato = 'pagato'
                             AND h.data_pagamento = r.entry_date AND abs(h.importo - abs(r.amount)) < 0.01 ORDER BY h.id LIMIT 1));
            IF v_f24 IS NOT NULL THEN
              -- Un tributo già registrato da solo (l'F24 è arrivato prima del movimento) ha già tolto
              -- la sua parte dalla banca: qui restano gli altri.
              SELECT jsonb_agg(t) INTO v_f24 FROM jsonb_array_elements(v_f24) t
               WHERE NOT public.contabilita_documento_registrato(p_company, 'f24', (t->>'id')::uuid);
              IF v_f24 IS NULL THEN s_gia := s_gia + 1; CONTINUE; END IF;
              SELECT sum((t->>'i')::numeric) INTO v_banca_f24 FROM jsonb_array_elements(v_f24) t;
              v_righe := public.contabilita_riga(k->>v_banca, 'avere', v_banca_f24 * sign(tot), NULL);
              FOR v_trib IN SELECT value AS t FROM jsonb_array_elements(v_f24) LOOP
                v_righe := v_righe || public.contabilita_riga(k->>public.contabilita_ruolo_tributo(k, v_trib.t->>'t', v_cedolini), 'dare',
                  (v_trib.t->>'i')::numeric * sign(tot), concat_ws(' ', 'tributo', v_trib.t->>'t', v_trib.t->>'d'));
              END LOOP;
              v_conto := '13.11';
            END IF;
          END IF;
          v_causale := CASE
            WHEN v_conto = '13.04' THEN 'Pagamento fornitore'
            WHEN v_conto = '05.01' THEN 'Incasso da cliente'
            WHEN v_conto = '13.30' THEN 'Pagamento stipendi'
            WHEN v_conto IN ('13.13', '13.11') THEN 'Versamento F24'
            WHEN r.direction = 'entrata' THEN 'Entrata di prima nota'
            ELSE 'Uscita di prima nota' END;
        END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), v_causale, coalesce(r.description, v_contro),
          r.reference_number, NULL, v_righe, v_origine, e.id, NULL);
        n_mov := n_mov + 1;

      ELSIF e.tipo = 'cedolini' THEN
        SELECT sum(coalesce(h.lordo, 0)) AS lordo, sum(coalesce(h.ritenute_irpef, 0)) AS irpef,
               sum(coalesce(h.contributi_dipendente, 0)) AS cdip, sum(coalesce(h.contributi_datore, 0)) AS cdat,
               sum(coalesce(h.netto, coalesce(h.lordo, 0) - coalesce(h.ritenute_irpef, 0) - coalesce(h.contributi_dipendente, 0))) AS netto,
               count(*) AS n
          INTO r FROM public.hr_cedolini h
         WHERE h.company_id = p_company AND h.anno = extract(year FROM e.data)::int AND h.mese = extract(month FROM e.data)::int
           AND h.stato IN ('emesso', 'pagato');
        IF NOT (k ? '13.12' AND k ? '13.20' AND k ? '13.30') THEN
          RAISE EXCEPTION 'con i cedolini servono i conti Erario c/ritenute, debiti verso istituti previdenziali e debiti verso dipendenti (ruoli 13.12, 13.20, 13.30)';
        END IF;
        -- Il netto è quello del cedolino; quello che il lordo non spiega (altre trattenute) va fra i debiti diversi.
        dif := round(r.lordo - r.irpef - r.cdip - r.netto, 2);
        v_righe := public.contabilita_riga(k->>'30.10', 'dare', r.lordo, 'retribuzioni lorde')
                || public.contabilita_riga(k->>(CASE WHEN k ? '30.11' THEN '30.11' ELSE '30.10' END), 'dare', r.cdat, 'contributi a carico dell''azienda')
                || public.contabilita_riga(k->>'13.12', 'avere', r.irpef, 'ritenute IRPEF dei dipendenti')
                || public.contabilita_riga(k->>'13.20', 'avere', r.cdip + r.cdat, 'contributi da versare')
                || public.contabilita_riga(k->>'13.30', 'avere', r.netto, 'netto da pagare ai dipendenti')
                || public.contabilita_riga(k->>(CASE WHEN k ? '13.31' THEN '13.31' ELSE '13.30' END), 'avere', dif, 'altre trattenute');
        -- Il mese si registra una volta, ma i cedolini cambiano (una bozza emessa dopo, una correzione):
        -- se la scrittura viva non corrisponde più, si storna e si rifà.
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = 'cedolini' AND s.origine_id = e.id
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_viva.id IS NOT NULL THEN
          IF (SELECT jsonb_agg(jsonb_build_array(conto_id, dare, avere) ORDER BY conto_id, dare, avere) FROM public.contabilita_righe WHERE scrittura_id = v_viva.id)
             = (SELECT jsonb_agg(jsonb_build_array((x->>'conto_id')::uuid, coalesce((x->>'dare')::numeric, 0), coalesce((x->>'avere')::numeric, 0))
                                 ORDER BY (x->>'conto_id')::uuid, coalesce((x->>'dare')::numeric, 0), coalesce((x->>'avere')::numeric, 0))
                  FROM jsonb_array_elements(v_righe) x) THEN
            s_gia := s_gia + 1; CONTINUE;
          END IF;
          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Cedolini del mese cambiati', NULL, NULL,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_viva.id),
            'storno', v_viva.id, v_viva.id);
        END IF;
        IF r.n = 0 THEN CONTINUE; END IF;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Cedolini del mese',
          r.n || ' cedolini di ' || to_char(e.data, 'MM/YYYY'), NULL, NULL, v_righe, v_origine, e.id, NULL);
        n_ced := n_ced + 1;

      ELSIF e.tipo = 'sparita' THEN
        SELECT s.* INTO v_viva FROM public.contabilita_scritture s WHERE s.id = e.id;
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
          'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Documento annullato, rifiutato o cancellato', v_viva.documento_numero, v_viva.documento_data,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_viva.id), 'storno', v_viva.id, v_viva.id);
        n_rif := n_rif + 1;

      ELSIF e.tipo = 'f24' THEN
        SELECT * INTO r FROM public.f24_entries WHERE id = e.id;
        v_conto := public.contabilita_ruolo_tributo(k, r.tributo_code, v_cedolini);
        v_righe := public.contabilita_riga(k->>v_conto, 'dare', r.importo, concat_ws(' ', 'tributo', r.tributo_code, r.tributo_descrizione))
                || public.contabilita_riga(k->>'06.01', 'avere', r.importo, NULL);
        PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, e.data), 'Versamento F24',
          concat_ws(' ', 'F24', lpad(r.mese::text, 2, '0') || '/' || r.anno, r.tributo_code), r.tributo_code, NULL, v_righe, v_origine, e.id, NULL);
        n_mov := n_mov + 1;
      END IF;
    EXCEPTION WHEN others THEN
      s_errori := s_errori || jsonb_build_array(format('%s %s del %s: %s', e.tipo, e.id, to_char(e.data, 'DD/MM/YYYY'), SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fatture_emesse', n_em, 'fatture_ricevute', n_ric, 'incassi', n_inc, 'pagamenti', n_pag, 'altre', n_alt,
    'movimenti', n_mov, 'giroconti_saltati', s_giro, 'cedolini', n_ced,
    'saltate_solo_testata', s_testata, 'gia_generate', s_gia, 'riallineate', n_rif, 'errori', s_errori,
    'avvisi', v_avvisi);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_piano_standard(p_company uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  WITH p(codice, descrizione, natura, sezione, voce, mastro) AS (VALUES
    ('01', 'Immobilizzazioni immateriali', 'attivo', 'SPA', 'B.I', NULL),
    ('01.01', 'Software e licenze', 'attivo', 'SPA', 'B.I.3', '01'),
    ('01.02', 'Altre immobilizzazioni immateriali', 'attivo', 'SPA', 'B.I.7', '01'),
    ('02', 'Immobilizzazioni materiali', 'attivo', 'SPA', 'B.II', NULL),
    ('02.01', 'Terreni e fabbricati', 'attivo', 'SPA', 'B.II.1', '02'),
    ('02.02', 'Impianti e macchinari', 'attivo', 'SPA', 'B.II.2', '02'),
    ('02.03', 'Attrezzature di cantiere', 'attivo', 'SPA', 'B.II.3', '02'),
    ('02.04', 'Automezzi', 'attivo', 'SPA', 'B.II.4', '02'),
    ('02.05', 'Mobili e macchine d''ufficio', 'attivo', 'SPA', 'B.II.4', '02'),
    ('02.90', 'Fondo ammortamento fabbricati', 'attivo', 'SPA', 'B.II.1', '02'),
    ('02.91', 'Fondo ammortamento impianti e macchinari', 'attivo', 'SPA', 'B.II.2', '02'),
    ('02.92', 'Fondo ammortamento attrezzature', 'attivo', 'SPA', 'B.II.3', '02'),
    ('02.93', 'Fondo ammortamento altri beni', 'attivo', 'SPA', 'B.II.4', '02'),
    ('03', 'Immobilizzazioni finanziarie', 'attivo', 'SPA', 'B.III', NULL),
    ('03.01', 'Partecipazioni', 'attivo', 'SPA', 'B.III.1', '03'),
    ('04', 'Rimanenze', 'attivo', 'SPA', 'C.I', NULL),
    ('04.01', 'Materie prime e materiali', 'attivo', 'SPA', 'C.I.1', '04'),
    ('04.02', 'Lavori in corso su ordinazione', 'attivo', 'SPA', 'C.I.3', '04'),
    ('05', 'Crediti', 'attivo', 'SPA', 'C.II', NULL),
    ('05.01', 'Crediti verso clienti', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.02', 'Fatture da emettere', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.03', 'Ritenute a garanzia da incassare', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.10', 'IVA su acquisti', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.11', 'Erario c/IVA a credito', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.12', 'Crediti d''imposta e acconti', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.13', 'Crediti d''imposta da bonus edilizi', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.20', 'Crediti diversi', 'attivo', 'SPA', 'C.II.5-quater', '05'),
    ('05.21', 'Anticipi a fornitori', 'attivo', 'SPA', 'C.II.5-quater', '05'),
    ('06', 'Disponibilità liquide', 'attivo', 'SPA', 'C.IV', NULL),
    ('06.01', 'Banca c/c', 'attivo', 'SPA', 'C.IV.1', '06'),
    ('06.02', 'Cassa', 'attivo', 'SPA', 'C.IV.3', '06'),
    ('07', 'Ratei e risconti attivi', 'attivo', 'SPA', 'D', NULL),
    ('07.01', 'Ratei attivi', 'attivo', 'SPA', 'D', '07'),
    ('07.02', 'Risconti attivi', 'attivo', 'SPA', 'D', '07'),
    ('10', 'Patrimonio netto', 'passivo', 'SPP', 'A', NULL),
    ('10.01', 'Capitale sociale', 'passivo', 'SPP', 'A.I', '10'),
    ('10.02', 'Riserva legale', 'passivo', 'SPP', 'A.IV', '10'),
    ('10.03', 'Altre riserve', 'passivo', 'SPP', 'A.VI', '10'),
    ('10.04', 'Utili (perdite) portati a nuovo', 'passivo', 'SPP', 'A.VIII', '10'),
    ('10.05', 'Utile (perdita) dell''esercizio', 'passivo', 'SPP', 'A.IX', '10'),
    ('11', 'Fondi per rischi e oneri', 'passivo', 'SPP', 'B', NULL),
    ('11.01', 'Fondo rischi', 'passivo', 'SPP', 'B.4', '11'),
    ('12', 'Trattamento di fine rapporto', 'passivo', 'SPP', 'C', NULL),
    ('12.01', 'Fondo TFR', 'passivo', 'SPP', 'C', '12'),
    ('13', 'Debiti', 'passivo', 'SPP', 'D', NULL),
    ('13.01', 'Debiti verso banche', 'passivo', 'SPP', 'D.4', '13'),
    ('13.02', 'Finanziamenti', 'passivo', 'SPP', 'D.4', '13'),
    ('13.03', 'Acconti da clienti', 'passivo', 'SPP', 'D.6', '13'),
    ('13.04', 'Debiti verso fornitori', 'passivo', 'SPP', 'D.7', '13'),
    ('13.05', 'Fatture da ricevere', 'passivo', 'SPP', 'D.7', '13'),
    ('13.06', 'Ritenute a garanzia verso subappaltatori', 'passivo', 'SPP', 'D.7', '13'),
    ('13.10', 'IVA su vendite', 'passivo', 'SPP', 'D.12', '13'),
    ('13.11', 'Erario c/IVA a debito', 'passivo', 'SPP', 'D.12', '13'),
    ('13.12', 'Erario c/ritenute', 'passivo', 'SPP', 'D.12', '13'),
    ('13.13', 'Debiti per imposte', 'passivo', 'SPP', 'D.12', '13'),
    ('13.20', 'Debiti verso istituti previdenziali', 'passivo', 'SPP', 'D.13', '13'),
    ('13.30', 'Debiti verso dipendenti', 'passivo', 'SPP', 'D.14', '13'),
    ('13.31', 'Debiti diversi', 'passivo', 'SPP', 'D.14', '13'),
    ('13.90', 'Partite da verificare', 'passivo', 'SPP', 'D.14', '13'),
    ('14', 'Ratei e risconti passivi', 'passivo', 'SPP', 'E', NULL),
    ('14.01', 'Ratei passivi', 'passivo', 'SPP', 'E', '14'),
    ('14.02', 'Risconti passivi', 'passivo', 'SPP', 'E', '14'),
    ('20', 'Valore della produzione', 'ricavo', 'CE', 'A', NULL),
    ('20.01', 'Ricavi da lavori e prestazioni', 'ricavo', 'CE', 'A.1', '20'),
    ('20.02', 'Ricavi da vendite', 'ricavo', 'CE', 'A.1', '20'),
    ('20.03', 'Variazione lavori in corso su ordinazione', 'ricavo', 'CE', 'A.3', '20'),
    ('20.04', 'Altri ricavi e proventi', 'ricavo', 'CE', 'A.5', '20'),
    ('20.05', 'Contributi in conto esercizio', 'ricavo', 'CE', 'A.5', '20'),
    ('30', 'Costi della produzione', 'costo', 'CE', 'B', NULL),
    ('30.01', 'Acquisto materiali', 'costo', 'CE', 'B.6', '30'),
    ('30.02', 'Subappalti', 'costo', 'CE', 'B.7', '30'),
    ('30.03', 'Servizi e consulenze', 'costo', 'CE', 'B.7', '30'),
    ('30.04', 'Utenze', 'costo', 'CE', 'B.7', '30'),
    ('30.05', 'Carburanti e trasporti', 'costo', 'CE', 'B.7', '30'),
    ('30.06', 'Noli e godimento beni di terzi', 'costo', 'CE', 'B.8', '30'),
    ('30.07', 'Affitti passivi', 'costo', 'CE', 'B.8', '30'),
    ('30.10', 'Salari e stipendi', 'costo', 'CE', 'B.9.a', '30'),
    ('30.11', 'Oneri sociali', 'costo', 'CE', 'B.9.b', '30'),
    ('30.12', 'Accantonamento TFR', 'costo', 'CE', 'B.9.c', '30'),
    ('30.20', 'Ammortamento immobilizzazioni immateriali', 'costo', 'CE', 'B.10.a', '30'),
    ('30.21', 'Ammortamento immobilizzazioni materiali', 'costo', 'CE', 'B.10.b', '30'),
    ('30.30', 'Variazione delle rimanenze di materiali', 'costo', 'CE', 'B.11', '30'),
    ('30.40', 'Oneri diversi di gestione', 'costo', 'CE', 'B.14', '30'),
    ('40', 'Proventi e oneri finanziari', 'costo', 'CE', 'C', NULL),
    ('40.01', 'Interessi attivi e proventi finanziari', 'ricavo', 'CE', 'C.16', '40'),
    ('40.02', 'Interessi passivi e oneri bancari', 'costo', 'CE', 'C.17', '40'),
    ('50', 'Imposte', 'costo', 'CE', '20', NULL),
    ('50.01', 'Imposte sul reddito dell''esercizio', 'costo', 'CE', '20', '50')
  ), ins AS (
    INSERT INTO public.contabilita_conti (company_id, codice, descrizione, natura, sezione_cee, voce_cee, movimentabile)
    SELECT p_company, codice, descrizione, natura, sezione, voce, mastro IS NOT NULL FROM p
    ON CONFLICT (company_id, codice) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM ins;
  UPDATE public.contabilita_conti c SET mastro_id = m.id
    FROM public.contabilita_conti m
   WHERE c.company_id = p_company AND m.company_id = p_company AND c.mastro_id IS NULL
     AND c.codice LIKE '%.%' AND m.codice = split_part(c.codice, '.', 1);
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_assegna_ruolo(p_company uuid, p_ruolo text, p_conto uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_natura text := CASE p_ruolo
    WHEN '04.01' THEN 'attivo' WHEN '04.02' THEN 'attivo' WHEN '07.01' THEN 'attivo' WHEN '07.02' THEN 'attivo'
    WHEN '14.01' THEN 'passivo' WHEN '14.02' THEN 'passivo' WHEN '20.03' THEN 'ricavo' WHEN '30.30' THEN 'costo'
    WHEN '20.04' THEN 'ricavo' WHEN '30.40' THEN 'costo'
    WHEN '01.01' THEN 'attivo' WHEN '01.02' THEN 'attivo'
    WHEN '02.01' THEN 'attivo' WHEN '02.02' THEN 'attivo' WHEN '02.03' THEN 'attivo' WHEN '02.04' THEN 'attivo' WHEN '02.05' THEN 'attivo'
    WHEN '02.90' THEN 'attivo' WHEN '02.91' THEN 'attivo' WHEN '02.92' THEN 'attivo' WHEN '02.93' THEN 'attivo'
    WHEN '30.20' THEN 'costo' WHEN '30.21' THEN 'costo'
    WHEN '30.12' THEN 'costo' WHEN '12.01' THEN 'passivo' WHEN '10.04' THEN 'passivo' WHEN '10.05' THEN 'passivo'
    WHEN '05.11' THEN 'attivo' WHEN '06.02' THEN 'attivo' WHEN '50.01' THEN 'costo'
    WHEN '13.11' THEN 'passivo' WHEN '13.12' THEN 'passivo' WHEN '13.13' THEN 'passivo' WHEN '13.20' THEN 'passivo' WHEN '13.30' THEN 'passivo'
    WHEN '13.90' THEN 'passivo' WHEN '13.02' THEN 'passivo' WHEN '13.01' THEN 'passivo' WHEN '10.03' THEN 'passivo'
    WHEN '05.12' THEN 'attivo' WHEN '05.13' THEN 'attivo' WHEN '40.02' THEN 'costo' END;
  c record;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF v_natura IS NULL THEN RAISE EXCEPTION 'Ruolo non assegnabile da Fine anno: %', p_ruolo USING ERRCODE = '22023'; END IF;
  SELECT codice, natura, codice_standard INTO c FROM public.contabilita_conti
   WHERE id = p_conto AND company_id = p_company AND movimentabile AND attivo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Il conto non è un conto movimentabile di questa azienda' USING ERRCODE = '22023'; END IF;
  IF c.natura <> v_natura THEN RAISE EXCEPTION 'Per questo ruolo serve un conto di natura «%»', v_natura USING ERRCODE = '22023'; END IF;
  -- Un conto fa già da ruolo anche senza codice_standard, quando il suo codice è quello del ruolo.
  IF coalesce(c.codice_standard, c.codice) <> p_ruolo
     AND (c.codice_standard IS NOT NULL OR public.contabilita_conti_per_ruolo(p_company)->>c.codice = p_conto::text) THEN
    RAISE EXCEPTION 'Il conto % fa già da %: scegline un altro, o crealo nel Piano dei conti', c.codice, coalesce(c.codice_standard, c.codice) USING ERRCODE = '22023';
  END IF;
  UPDATE public.contabilita_conti SET codice_standard = NULL WHERE company_id = p_company AND codice_standard = p_ruolo AND id <> p_conto;
  UPDATE public.contabilita_conti SET codice_standard = p_ruolo WHERE id = p_conto;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_chiudi_esercizio(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  k jsonb; v_utile_conto uuid; v_mastro uuid; v_righe jsonb := '[]'::jsonb; v_aper jsonb := '[]'::jsonb;
  v_utile numeric := 0; x record; v_iva numeric := 0; v_fine jsonb; v_a_nuovo uuid; v_id_chiu uuid; v_id_aper uuid; v_aper_esiste boolean; v_n_ce int := 0; v_n_sp int := 0; v_prima_aperto int;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è già chiuso', p_anno USING ERRCODE = '23505';
  END IF;
  -- Gli esercizi si chiudono in ordine: un anno prima ancora aperto porterebbe la sua apertura dentro
  -- questo, già chiuso, e l'apertura dell'anno dopo partirebbe da saldi incompleti.
  SELECT min(s.esercizio) INTO v_prima_aperto FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.esercizio < p_anno
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_esercizi e WHERE e.company_id = p_company AND e.anno = s.esercizio AND e.chiuso_il IS NOT NULL);
  IF v_prima_aperto IS NOT NULL AND NOT p_anteprima THEN
    RAISE EXCEPTION 'Chiudi prima l''esercizio %: gli esercizi si chiudono in ordine', v_prima_aperto USING ERRCODE = '22023';
  END IF;
  IF NOT p_anteprima AND EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = p_company AND anno = p_anno + 1 AND chiuso_il IS NOT NULL) THEN
    RAISE EXCEPTION 'L''esercizio % è già chiuso: riaprilo prima di chiudere il %', p_anno + 1, p_anno USING ERRCODE = '22023';
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
      'apertura_gia_presente', v_aper_esiste,
      -- Utile senza le imposte di competenza stanziate (contabilita_imposte): da fare prima di chiudere.
      'imposte_da_stanziare', v_utile > 0 AND NOT public.contabilita_documento_registrato(p_company, 'imposte', md5('imposte:' || p_company || ':' || p_anno)::uuid),
      'conto_utile', k ? '10.05', 'conto_utili_a_nuovo', k ? '10.04', 'iva_non_liquidata', v_iva,
      'esercizio_precedente_aperto', v_prima_aperto,
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
