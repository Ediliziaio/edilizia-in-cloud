-- IVA sugli acquisti nel periodo in cui si detrae, non in quello della data
-- scritta dal fornitore (24/09/2026).
--
-- Art. 19 DPR 633/72 e art. 1 DPR 100/1998 (come modificato dal DL 119/2018):
-- l'IVA di un acquisto si detrae nel periodo in cui la fattura è RICEVUTA (e
-- registrata); se è ricevuta entro il 15 del mese dopo quello dell'operazione,
-- anche nel mese dell'operazione — ma non a cavallo d'anno: la fattura di
-- dicembre ricevuta a gennaio va a gennaio.
--
-- Registro IVA e liquidazione mettevano ogni acquisto nel mese della data della
-- fattura: una fattura del 28 agosto consegnata dallo SDI il 2 ottobre finiva in
-- agosto, due mesi prima di poterla detrarre. Ora:
--   · data_detrazione_iva(data fattura, ricevuta il): la regola, in un posto
--     solo. Senza data di ricezione (XML caricati a mano, fatture sincronizzate
--     dai gestionali) resta la data della fattura, come prima;
--   · fatture_ricevute_periodo_iva: la vista che legge la pagina Registro IVA;
--   · liquidazione_iva_periodo: gli acquisti per data di detrazione.
--
-- Idempotente.

set local lock_timeout = '5s';

create or replace function public.data_detrazione_iva(p_data_fattura date, p_ricevuta_il timestamptz)
 returns date
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when p_data_fattura is null or p_ricevuta_il is null then p_data_fattura
    when (p_ricevuta_il at time zone 'Europe/Rome')::date <= p_data_fattura then p_data_fattura
    -- Ricevuta entro il 15 del mese dopo, nello stesso anno: vale il mese dell'operazione.
    when date_trunc('month', (p_ricevuta_il at time zone 'Europe/Rome')::date)
           = date_trunc('month', p_data_fattura) + interval '1 month'
         and extract(day from (p_ricevuta_il at time zone 'Europe/Rome')::date) <= 15
         and extract(year from (p_ricevuta_il at time zone 'Europe/Rome')::date) = extract(year from p_data_fattura)
      then p_data_fattura
    -- Altrimenti il mese in cui è arrivata.
    else (p_ricevuta_il at time zone 'Europe/Rome')::date
  end;
$function$;

comment on function public.data_detrazione_iva(date, timestamptz) is
  'Data che colloca un acquisto nella liquidazione IVA: ricezione, o mese della fattura se ricevuta entro il 15 del mese dopo nello stesso anno (art. 1 DPR 100/1998). Senza data di ricezione: la data della fattura.';

revoke all on function public.data_detrazione_iva(date, timestamptz) from public, anon;
grant execute on function public.data_detrazione_iva(date, timestamptz) to authenticated, service_role;

-- La pagina Registro IVA legge da qui: le stesse righe di fatture_ricevute (con
-- le sue regole di accesso, security_invoker) più la data di detrazione.
create or replace view public.fatture_ricevute_periodo_iva
with (security_invoker = true) as
select f.id,
       f.company_id,
       f.numero_fattura,
       f.data_fattura,
       f.data_ricezione_sdi,
       public.data_detrazione_iva(f.data_fattura, f.data_ricezione_sdi) as data_detrazione,
       f.tipo_documento,
       f.cedente_ragione_sociale,
       f.imponibile_totale,
       f.iva_totale,
       f.totale_documento,
       f.riepilogo_iva,
       f.stato
  from public.fatture_ricevute f;

comment on view public.fatture_ricevute_periodo_iva is
  'Fatture ricevute con la data di detrazione IVA (data_detrazione_iva). La legge la pagina Registro IVA; le regole di accesso sono quelle di fatture_ricevute.';

revoke all on public.fatture_ricevute_periodo_iva from public, anon;
grant select on public.fatture_ricevute_periodo_iva to authenticated, service_role;

create or replace function public.liquidazione_iva_periodo(p_company_id uuid, p_periodo text, p_anno integer, p_mese integer default null::integer, p_trimestre integer default null::integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
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
  v_senza_ricezione int;
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
  acq_doc AS (
    -- Nel periodo per data di detrazione (data_detrazione_iva), non per data
    -- della fattura. La data della fattura precede sempre quella di detrazione:
    -- il primo filtro serve solo a non calcolare la regola su tutto l'archivio.
    SELECT f.id,
           (upper(coalesce(f.tipo_documento, '')) = 'TD04'
            OR upper(coalesce(f.tipo_documento, '')) LIKE '%CREDIT%') AS nota_credito,
           f.imponibile_totale, f.iva_totale, f.riepilogo_iva,
           (f.data_ricezione_sdi IS NULL) AS senza_ricezione
    FROM public.fatture_ricevute f
    WHERE f.company_id = p_company_id
      AND f.stato IN ('non_letta', 'letta', 'contabilizzata')
      AND f.data_fattura <= v_al
      AND f.data_fattura >= (v_dal - interval '13 months')::date
      AND public.data_detrazione_iva(f.data_fattura, f.data_ricezione_sdi) BETWEEN v_dal AND v_al
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
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_segno) AS iva_vendite,
      (SELECT coalesce(sum(imponibile) FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_segno) AS imp_vendite,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'S'), 0) FROM vend_segno) AS iva_split,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'D'), 0) FROM vend_segno) AS iva_differita,
      (SELECT coalesce(sum(imposta), 0)    FROM acq_segno) AS iva_acquisti,
      (SELECT coalesce(sum(imponibile), 0) FROM acq_segno) AS imp_acquisti,
      (SELECT count(*) FROM vend_doc) AS n_vendite,
      (SELECT count(*) FROM acq_doc)  AS n_acquisti,
      (SELECT count(*) FROM acq_doc WHERE senza_ricezione) AS n_senza_ricezione
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
    'documenti', jsonb_build_object('vendite', t.n_vendite, 'acquisti', t.n_acquisti,
                                    'acquisti_senza_data_ricezione', t.n_senza_ricezione),
    'escluso', jsonb_build_object(
      'split_payment', round(t.iva_split, 2),
      'nota', 'IVA in scissione dei pagamenti: la versa il committente'),
    'esigibilita_differita', round(t.iva_differita, 2),
    'dettaglio_aliquote', coalesce(a.righe, '[]'::jsonb)
  ), t.n_vendite, t.n_acquisti, t.n_senza_ricezione
  INTO v_out, v_n_vendite, v_n_acquisti, v_senza_ricezione
  FROM tot t CROSS JOIN aliquote a;

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
      'Esigibilità differita (IVA per cassa) conteggiata alla data del documento, non a quella dell''incasso',
      'Acquisti nel periodo in cui sono stati ricevuti dallo SDI (o nel mese della fattura se ricevuti entro il 15 del mese dopo). '
        || CASE WHEN v_senza_ricezione > 0
             THEN v_senza_ricezione || ' senza data di ricezione (caricati a mano o dai gestionali): collocati alla data della fattura'
             ELSE 'Tutti con data di ricezione' END
    )
  );
END;
$function$;
