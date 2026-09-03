-- Ondata 0.3 — Liquidazione IVA sui dati veri
--
-- Prima: supabase/functions/calcola-liquidazione-iva non leggeva le fatture.
-- Cercava in prima_nota i conti il cui nome *somiglia* alla parola IVA
--   .or("conto.ilike.%IVA%,conto.ilike.%2610%,…")
-- sommava alla cieca dare e avere, e se la query falliva scriveva un warning
-- nei log e restituiva comunque iva_vendite=0, iva_acquisti=0, saldo=0 —
-- presentato all'utente come una liquidazione valida. Un'impresa che non tiene
-- la prima nota (la maggioranza) vedeva "IVA da versare: 0,00 €".
--
-- Ora il calcolo sta qui, sul database, e legge le stesse fonti che il Registro
-- IVA usa già correttamente: documenti_fiscali per le vendite, fatture_ricevute
-- per gli acquisti. La stessa regola serve l'edge function, il Registro IVA e
-- chiunque altro: una sola definizione di "quanta IVA devo".
--
-- E quando non può calcolare lo dice: `calcolabile: false` con il motivo, mai
-- uno zero che sembra una risposta.
--
-- Idempotente.

-- Un valore non numerico dentro riepilogo_iva non deve far esplodere l'intera
-- liquidazione: vale zero e si vede nel conteggio delle righe illeggibili.
CREATE OR REPLACE FUNCTION public.num_da_json(p_valore text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_valore IS NULL THEN 0
    WHEN btrim(p_valore) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(p_valore)::numeric
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_periodo(
  p_company_id uuid,
  p_periodo    text,
  p_anno       integer,
  p_mese       integer DEFAULT NULL,
  p_trimestre  integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Gli stessi tipi che il Registro IVA considera vendite.
  v_tipi_vendite text[] := ARRAY[
    'fattura','fattura_pa','nota_credito','nota_debito','autofattura',
    'fattura_riepilogativa','parcella','fattura_accompagnatoria',
    'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];
  v_dal        date;
  v_al         date;
  v_etichetta  text;
  v_mesi       text[] := ARRAY['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  v_out        jsonb;
  v_n_vendite  int;
  v_n_acquisti int;
BEGIN
  IF public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_anno IS NULL OR p_anno < 2000 OR p_anno > 2100 THEN
    RAISE EXCEPTION 'anno non valido: %', p_anno USING ERRCODE = '22023';
  END IF;

  IF p_periodo = 'mensile' THEN
    IF p_mese IS NULL OR p_mese < 1 OR p_mese > 12 THEN
      RAISE EXCEPTION 'mese non valido: %', p_mese USING ERRCODE = '22023';
    END IF;
    v_dal := make_date(p_anno, p_mese, 1);
    v_al  := (v_dal + interval '1 month' - interval '1 day')::date;
    v_etichetta := v_mesi[p_mese] || ' ' || p_anno;
  ELSIF p_periodo = 'trimestrale' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN
      RAISE EXCEPTION 'trimestre non valido: %', p_trimestre USING ERRCODE = '22023';
    END IF;
    v_dal := make_date(p_anno, (p_trimestre - 1) * 3 + 1, 1);
    v_al  := (v_dal + interval '3 months' - interval '1 day')::date;
    v_etichetta := p_trimestre || '° Trimestre ' || p_anno;
  ELSE
    RAISE EXCEPTION 'periodo non valido: % (attesi "mensile" o "trimestrale")', p_periodo
      USING ERRCODE = '22023';
  END IF;

  WITH
  -- ── vendite: i documenti emessi nel periodo ────────────────────────────────
  vend_doc AS (
    SELECT d.id,
           (d.tipo = 'nota_credito') AS nota_credito,
           coalesce(nullif(d.esigibilita_iva, ''), 'I') AS esig_doc,
           d.imponibile_totale, d.iva_totale, d.riepilogo_iva
    FROM public.documenti_fiscali d
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND d.tipo = ANY(v_tipi_vendite)
      AND d.stato NOT IN ('bozza', 'annullata')
      AND d.data_emissione BETWEEN v_dal AND v_al
  ),
  -- Una riga per aliquota quando il riepilogo c'è; altrimenti il totale del
  -- documento, così nessun documento sparisce dal calcolo.
  vend_righe AS (
    SELECT v.id, v.nota_credito,
           coalesce(nullif(r.value ->> 'aliquota', ''), '—') AS aliquota,
           upper(coalesce(nullif(r.value ->> 'esigibilita', ''), v.esig_doc)) AS esigibilita,
           abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           abs(public.num_da_json(r.value ->> 'imposta'))    AS imposta
    FROM vend_doc v
    CROSS JOIN LATERAL jsonb_array_elements(v.riepilogo_iva) r
    WHERE jsonb_array_length(coalesce(v.riepilogo_iva, '[]'::jsonb)) > 0
    UNION ALL
    SELECT v.id, v.nota_credito, '—', upper(v.esig_doc),
           abs(coalesce(v.imponibile_totale, 0)), abs(coalesce(v.iva_totale, 0))
    FROM vend_doc v
    WHERE jsonb_array_length(coalesce(v.riepilogo_iva, '[]'::jsonb)) = 0
  ),
  vend_segno AS (
    SELECT aliquota, esigibilita,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM vend_righe
  ),
  -- ── acquisti: le fatture ricevute nel periodo ─────────────────────────────
  acq_doc AS (
    SELECT f.id,
           (upper(coalesce(f.tipo_documento, '')) = 'TD04'
            OR upper(coalesce(f.tipo_documento, '')) LIKE '%CREDIT%') AS nota_credito,
           f.imponibile_totale, f.iva_totale, f.riepilogo_iva
    FROM public.fatture_ricevute f
    WHERE f.company_id = p_company_id
      AND f.stato IN ('non_letta', 'letta', 'contabilizzata')
      AND f.data_fattura BETWEEN v_dal AND v_al
  ),
  acq_righe AS (
    SELECT a.id, a.nota_credito,
           coalesce(nullif(r.value ->> 'aliquota', ''), '—') AS aliquota,
           abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           abs(public.num_da_json(r.value ->> 'imposta'))    AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(a.riepilogo_iva) r
    WHERE jsonb_array_length(coalesce(a.riepilogo_iva, '[]'::jsonb)) > 0
    UNION ALL
    SELECT a.id, a.nota_credito, '—',
           abs(coalesce(a.imponibile_totale, 0)), abs(coalesce(a.iva_totale, 0))
    FROM acq_doc a
    WHERE jsonb_array_length(coalesce(a.riepilogo_iva, '[]'::jsonb)) = 0
  ),
  acq_segno AS (
    SELECT aliquota,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM acq_righe
  ),
  tot AS (
    SELECT
      -- Scissione dei pagamenti (esigibilità S): l'IVA la versa il committente
      -- direttamente all'erario, non entra nel debito di chi emette.
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_segno) AS iva_vendite,
      (SELECT coalesce(sum(imponibile) FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_segno) AS imp_vendite,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'S'), 0) FROM vend_segno) AS iva_split,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'D'), 0) FROM vend_segno) AS iva_differita,
      (SELECT coalesce(sum(imposta), 0)    FROM acq_segno) AS iva_acquisti,
      (SELECT coalesce(sum(imponibile), 0) FROM acq_segno) AS imp_acquisti,
      (SELECT count(*) FROM vend_doc) AS n_vendite,
      (SELECT count(*) FROM acq_doc)  AS n_acquisti
  ),
  aliquote AS (
    SELECT jsonb_agg(x ORDER BY x ->> 'lato', x ->> 'aliquota') AS righe FROM (
      SELECT jsonb_build_object('lato','vendite','aliquota',aliquota,
               'imponibile', round(sum(imponibile), 2), 'imposta', round(sum(imposta), 2)) AS x
      FROM vend_segno GROUP BY aliquota
      UNION ALL
      SELECT jsonb_build_object('lato','acquisti','aliquota',aliquota,
               'imponibile', round(sum(imponibile), 2), 'imposta', round(sum(imposta), 2))
      FROM acq_segno GROUP BY aliquota
    ) s
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'tipo', p_periodo, 'anno', p_anno, 'mese', p_mese, 'trimestre', p_trimestre,
      'dal', v_dal, 'al', v_al, 'etichetta', v_etichetta),
    'iva_vendite',        round(t.iva_vendite, 2),
    'iva_acquisti',       round(t.iva_acquisti, 2),
    'imponibile_vendite', round(t.imp_vendite, 2),
    'imponibile_acquisti',round(t.imp_acquisti, 2),
    'saldo',              round(t.iva_vendite - t.iva_acquisti, 2),
    'documenti', jsonb_build_object('vendite', t.n_vendite, 'acquisti', t.n_acquisti),
    'escluso', jsonb_build_object(
      'split_payment', round(t.iva_split, 2),
      'nota', 'IVA in scissione dei pagamenti: la versa il committente'),
    'esigibilita_differita', round(t.iva_differita, 2),
    'dettaglio_aliquote', coalesce(a.righe, '[]'::jsonb)
  ), t.n_vendite, t.n_acquisti
  INTO v_out, v_n_vendite, v_n_acquisti
  FROM tot t CROSS JOIN aliquote a;

  -- Il punto dell'intervento: uno zero non si spaccia per una liquidazione.
  IF v_n_vendite = 0 AND v_n_acquisti = 0 THEN
    RETURN v_out || jsonb_build_object(
      'calcolabile', false,
      'motivo', format(
        'Nessun documento fiscale nel periodo %s: non c''è nulla da liquidare e non è possibile confermare un saldo. Verifica che le fatture emesse e il cassetto SdI siano aggiornati.',
        v_etichetta)
    );
  END IF;

  RETURN v_out || jsonb_build_object(
    'calcolabile', true,
    'ipotesi', jsonb_build_array(
      'IVA sugli acquisti considerata interamente detraibile: la quota di indetraibilità non è tracciata a sistema',
      'Esigibilità differita conteggiata alla data del documento, non a quella dell''incasso'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.liquidazione_iva_periodo(uuid, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_periodo(uuid, text, integer, integer, integer) TO authenticated, service_role;
