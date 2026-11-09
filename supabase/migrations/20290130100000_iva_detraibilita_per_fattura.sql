-- IVA indetraibile fattura per fattura (09/11/2026): auto al 40%, telefonia al 50%,
-- spese senza diritto alla detrazione. Senza indicazione resta tutta detraibile.
-- Riduce l'IVA detratta (VP5), non l'imponibile degli acquisti (VP3). Il reverse
-- charge resta a debito per intero: si riduce solo la parte a credito.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS detraibilita_percentuale numeric
  CHECK (detraibilita_percentuale IS NULL OR (detraibilita_percentuale >= 0 AND detraibilita_percentuale <= 100));
COMMENT ON COLUMN public.fatture_ricevute.detraibilita_percentuale IS
  'Quota di IVA detraibile (%). Null = 100.';

DO $patch$
DECLARE
  d text; v text; g text;
BEGIN
  -- La vista porta la percentuale.
  v := pg_get_viewdef('public.fatture_ricevute_periodo_iva'::regclass);
  IF v !~ 'detraibilita_percentuale' THEN
    v := regexp_replace(v, 'f\.cedente_piva\s+FROM', 'f.cedente_piva, f.detraibilita_percentuale FROM');
    IF v !~ 'detraibilita_percentuale' THEN RAISE EXCEPTION 'vista: punto non trovato'; END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.fatture_ricevute_periodo_iva WITH (security_invoker = true) AS ' || v;
  END IF;

  d := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  IF d !~ 'detraibile_pct' THEN
    d := regexp_replace(d, 'f\.aliquota_reverse_charge,\s+\(f\.data_ricezione_sdi IS NULL',
      'f.aliquota_reverse_charge, coalesce(f.detraibilita_percentuale, 100) AS detraibile_pct, (f.data_ricezione_sdi IS NULL');
    d := regexp_replace(d, $r$coalesce\(public\.num_da_json\(r\.value ->> 'imposta'\), 0\)\s+AS imposta(\s+)FROM acq_doc a$r$,
      $r$coalesce(public.num_da_json(r.value ->> 'imposta'), 0) AS imposta, a.detraibile_pct\1FROM acq_doc a$r$);
    d := regexp_replace(d, 'a\.fattore \* coalesce\(a\.iva_totale, 0\)\s*(\s)FROM acq_doc a',
      'a.fattore * coalesce(a.iva_totale, 0), a.detraibile_pct\1FROM acq_doc a');
    d := regexp_replace(d, 'round\(r\.imponibile \* coalesce\(a\.aliquota_reverse_charge, 22\) / 100, 2\)\s+AS imposta(\s+)FROM acq_doc a',
      'round(r.imponibile * coalesce(a.aliquota_reverse_charge, 22) / 100, 2) AS imposta, a.detraibile_pct\1FROM acq_doc a');
    d := regexp_replace(d, 'SELECT aliquota, imponibile, imposta FROM acq_righe',
      'SELECT aliquota, imponibile, round(imposta * detraibile_pct / 100, 2) AS imposta FROM acq_righe');
    d := regexp_replace(d, 'SELECT aliquota, 0::numeric, imposta FROM rc',
      'SELECT aliquota, 0::numeric, round(imposta * detraibile_pct / 100, 2) FROM rc');
    d := regexp_replace(d, '\(SELECT coalesce\(sum\(imposta\), 0\)\s+FROM acq_tutte\) AS iva_acquisti,',
      '(SELECT coalesce(sum(imposta), 0) FROM acq_tutte) AS iva_acquisti, (SELECT coalesce(sum(imposta - round(imposta * detraibile_pct / 100, 2)), 0) FROM acq_righe) + (SELECT coalesce(sum(imposta - round(imposta * detraibile_pct / 100, 2)), 0) FROM rc) AS iva_indetraibile,');
    d := regexp_replace(d, $r$'saldo',\s+round\(t\.iva_vendite - t\.iva_acquisti, 2\),$r$,
      $r$'saldo', round(t.iva_vendite - t.iva_acquisti, 2), 'iva_indetraibile', round(t.iva_indetraibile, 2),$r$);
    d := replace(d, 'IVA sugli acquisti considerata interamente detraibile: la quota di indetraibilità non è tracciata a sistema',
      'IVA sugli acquisti al netto della quota indetraibile indicata su ogni fattura; senza indicazione è detraibile al 100%');
    IF (length(d) - length(replace(d, 'detraibile_pct', ''))) / length('detraibile_pct') < 8 OR d !~ 'iva_indetraibile' THEN
      RAISE EXCEPTION 'liquidazione: punti non trovati';
    END IF;
    EXECUTE d;
  END IF;

  d := pg_get_functiondef('public.liquidazione_iva_righi(uuid,integer,integer,jsonb)'::regprocedure);
  IF d !~ 'iva_indetraibile' THEN
    d := replace(d, '  IF vp2 = 0 AND vp3 = 0 THEN',
$x$  IF coalesce((b ->> 'iva_indetraibile')::numeric, 0) > 0 THEN
    v_avvisi := v_avvisi || to_jsonb(format('IVA non detraibile del periodo: %s € (indicata sulle singole fatture).', b ->> 'iva_indetraibile'));
  END IF;
  IF vp2 = 0 AND vp3 = 0 THEN$x$);
    IF d !~ 'iva_indetraibile' THEN RAISE EXCEPTION 'righi: punto non trovato'; END IF;
    EXECUTE d;
  END IF;

  -- Cambiare la detraibilità di un periodo chiuso va fermato come cambiare gli importi.
  g := pg_get_functiondef('private.fiscalita_guard()'::regprocedure);
  IF g !~ 'detraibilita_percentuale' THEN
    g := replace(g, 'new.aliquota_reverse_charge,(new.stato in', $x$new.aliquota_reverse_charge,to_jsonb(new)->'detraibilita_percentuale',(new.stato in$x$);
    g := replace(g, 'old.aliquota_reverse_charge,(old.stato in', $x$old.aliquota_reverse_charge,to_jsonb(old)->'detraibilita_percentuale',(old.stato in$x$);
    IF (length(g) - length(replace(g, 'detraibilita_percentuale', ''))) / length('detraibilita_percentuale') <> 2 THEN
      RAISE EXCEPTION 'guardia: punti non trovati';
    END IF;
    EXECUTE g;
  END IF;
END $patch$;

CREATE OR REPLACE FUNCTION public.fiscalita_imposta_detraibilita(p_company uuid, p_ids uuid[], p_percentuale numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_ids uuid[]; v_richieste integer; v_aggiornate integer;
  v_valore numeric := nullif(p_percentuale, 100);
BEGIN
  PERFORM public.fiscalita_verifica_scrittura(p_company);
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_ids FROM unnest(p_ids) x WHERE x IS NOT NULL;
  v_richieste := cardinality(v_ids);
  IF v_richieste = 0 THEN RAISE EXCEPTION 'Nessuna fattura indicata' USING ERRCODE = '22023'; END IF;
  IF v_richieste > 2000 THEN RAISE EXCEPTION 'Al massimo 2000 fatture per volta' USING ERRCODE = '22023'; END IF;
  IF p_percentuale IS NULL OR p_percentuale < 0 OR p_percentuale > 100 THEN
    RAISE EXCEPTION 'La percentuale va da 0 a 100.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.fatture_ricevute f WHERE f.company_id = p_company AND f.id = ANY(v_ids) ORDER BY f.id FOR UPDATE;
  UPDATE public.fatture_ricevute f SET detraibilita_percentuale = v_valore
   WHERE f.company_id = p_company AND f.id = ANY(v_ids)
     AND f.detraibilita_percentuale IS DISTINCT FROM v_valore;
  GET DIAGNOSTICS v_aggiornate = ROW_COUNT;
  RETURN jsonb_build_object('aggiornate', v_aggiornate, 'saltate', v_richieste - v_aggiornate);
END $$;
REVOKE ALL ON FUNCTION public.fiscalita_imposta_detraibilita(uuid, uuid[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscalita_imposta_detraibilita(uuid, uuid[], numeric) TO authenticated, service_role;
