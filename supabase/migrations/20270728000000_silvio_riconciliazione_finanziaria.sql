-- RICONCILIAZIONE FINANZIARIA SILVIO — fix "ragiona a silos".
-- Verificato su prod (Demo Azienda): 166.370€ di rate incassate in
-- order_installments + 530.919€ su flag legacy orders, ma Silvio rispondeva
-- "non risultano incassi registrati" perché incassi_mensili leggeva SOLO
-- documenti_fiscali (0 fatture emesse: l'azienda fattura fuori EiC).
-- Stessi silos su: company_kpi (rate scadute solo da colonne legacy →
-- perdeva 34.510€ di rate scadute in order_installments), lista_scadenze
-- (solo tabella invoices CRM), pipeline_forecast (solo quotes → ignorava
-- 42 opportunità aperte).
--
-- Regola anti-DOPPIO CONTEGGIO (stessa gerarchia già usata dal frontend in
-- useCashFlowData): se una commessa ha rate in order_installments si usano
-- SOLO quelle; le colonne legacy (deposit/saldo/finanziamento) valgono solo
-- per le commesse senza rate DB.

-- ─── 1) Vista canonica rate commesse ────────────────────────────────────────
create or replace view public.v_rate_commesse_unificate
with (security_invoker = true) as
select o.company_id,
       o.id as order_id,
       o.client_name,
       coalesce(nullif(btrim(oi.label), ''), oi.type, 'Rata') as label,
       coalesce(oi.amount, 0)::numeric as amount,
       coalesce(oi.is_paid, false) as is_paid,
       oi.paid_date::date as paid_date,
       oi.expected_date::date as expected_date,
       'rate_db'::text as fonte
  from public.order_installments oi
  join public.orders o on o.id = oi.order_id
union all
select o.company_id, o.id, o.client_name,
       r.label, r.amount, r.is_paid, r.paid_date, r.expected_date, 'legacy'
  from public.orders o
  cross join lateral (
    values
      ('Acconto',       coalesce(o.deposit_amount, 0)::numeric,   coalesce(o.deposit_paid, false),   o.deposit_paid_date::date,   o.deposit_expected_date::date),
      ('Acconto 2',     coalesce(o.deposit_2_amount, 0)::numeric, coalesce(o.deposit_2_paid, false), o.deposit_2_paid_date::date, o.deposit_2_expected_date::date),
      ('Saldo',         coalesce(o.balance_amount, 0)::numeric,   coalesce(o.balance_paid, false),   o.balance_paid_date::date,   o.balance_expected_date::date),
      ('Finanziamento', coalesce(o.financing_amount, 0)::numeric, coalesce(o.financing_paid, false), o.financing_paid_date::date, o.financing_expected_date::date)
  ) as r(label, amount, is_paid, paid_date, expected_date)
  where r.amount > 0
    and not exists (select 1 from public.order_installments oi2 where oi2.order_id = o.id);

-- ─── 2) serie_grafico: incassi multi-fonte + venduto_mensile ────────────────
create or replace function public.silvio_tool_serie_grafico(p_company_id uuid, p_metric text default 'fatturato_mensile', p_mesi integer default 12)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  n int := greatest(3, least(coalesce(p_mesi, 12), 36));
  da date := (date_trunc('month', now()) - ((greatest(3, least(coalesce(p_mesi,12),36)) - 1) || ' months')::interval)::date;
  mese_abbr text[] := ARRAY['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  res jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id mancante');
  END IF;

  IF p_metric = 'fatturato_mensile' THEN
    WITH months AS (SELECT generate_series(da, date_trunc('month', now())::date, '1 month')::date AS m),
    agg AS (
      SELECT date_trunc('month', coalesce(data_emissione, created_at::date))::date AS m, sum(coalesce(totale_documento,0)) AS v
      FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL
        AND tipo IN ('fattura','fattura_pa','nota_credito','autofattura','fattura_riepilogativa')
        AND coalesce(data_emissione, created_at::date) >= da
      GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Fatturato per mese','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'), 'value', round(coalesce(agg.v,0),2)) ORDER BY months.m), '[]'::jsonb),
      'nota','Solo fatture emesse in EiC. Se è tutto zero l''azienda probabilmente fattura fuori piattaforma: usa venduto_mensile (commesse) e incassi_mensili prima di concludere che non c''è attività.')
    INTO res FROM months LEFT JOIN agg ON agg.m = months.m;

  ELSIF p_metric = 'venduto_mensile' THEN
    WITH months AS (SELECT generate_series(da, date_trunc('month', now())::date, '1 month')::date AS m),
    agg AS (
      SELECT date_trunc('month', created_at)::date AS m, sum(coalesce(total_amount,0)) AS v
      FROM orders
      WHERE company_id = p_company_id AND created_at >= da
      GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Venduto per mese (commesse firmate)','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'), 'value', round(coalesce(agg.v,0),2)) ORDER BY months.m), '[]'::jsonb),
      'nota','Valore commesse create nel mese: è il VENDUTO, non il fatturato né l''incassato.')
    INTO res FROM months LEFT JOIN agg ON agg.m = months.m;

  ELSIF p_metric = 'incassi_mensili' THEN
    WITH months AS (SELECT generate_series(da, date_trunc('month', now())::date, '1 month')::date AS m),
    fatture AS (
      SELECT date_trunc('month', pagato_at)::date AS m, sum(coalesce(importo_pagato,0)) AS v
      FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at IS NOT NULL AND pagato_at >= da
      GROUP BY 1),
    rate AS (
      SELECT date_trunc('month', paid_date)::date AS m, sum(amount) AS v
      FROM v_rate_commesse_unificate
      WHERE company_id = p_company_id AND is_paid AND paid_date IS NOT NULL AND paid_date >= da
      GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Incassi per mese (fatture + rate commesse)','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'),
        'value', round(coalesce(fatture.v,0) + coalesce(rate.v,0),2)) ORDER BY months.m), '[]'::jsonb),
      'fonti', jsonb_build_object(
        'fatture_incassate_eur', round(coalesce((SELECT sum(v) FROM fatture),0),2),
        'rate_commesse_incassate_eur', round(coalesce((SELECT sum(v) FROM rate),0),2)),
      'nota','Somma di incassi fatture e rate commesse segnate pagate (dedup: per le commesse con rate DB le colonne legacy sono ignorate). Se la stessa entrata fosse registrata sia come fattura sia come rata può contare doppio: confronta le fonti.')
    INTO res FROM months LEFT JOIN fatture ON fatture.m = months.m LEFT JOIN rate ON rate.m = months.m;

  ELSIF p_metric = 'cantieri_per_stato' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Commesse per stato','unita',null,'x_label','stato',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', stato, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(status,'(n/d)') AS stato, count(*) AS c FROM orders WHERE company_id = p_company_id GROUP BY 1) q;

  ELSIF p_metric = 'documenti_per_tipo' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Documenti per tipo','unita',null,'x_label','tipo',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', tipo, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(tipo,'(n/d)') AS tipo, count(*) AS c FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL AND coalesce(data_emissione, created_at::date) >= da GROUP BY 1) q;

  ELSIF p_metric = 'preventivi_per_stato' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Preventivi per stato','unita',null,'x_label','stato',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', stato, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(stato,'(n/d)') AS stato, count(*) AS c FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL AND tipo = 'preventivo' GROUP BY 1) q;

  ELSIF p_metric = 'lead_per_fonte' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Lead per fonte','unita',null,'x_label','fonte',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', fonte, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(source,'(n/d)') AS fonte, count(*) AS c FROM marketing_contacts
      WHERE company_id = p_company_id GROUP BY 1) q;

  ELSIF p_metric = 'scadenze_incassi' THEN
    WITH months AS (
      SELECT generate_series(date_trunc('month', now())::date,
                             (date_trunc('month', now()) + ((n-1) || ' months')::interval)::date, '1 month')::date AS m),
    fatture AS (
      SELECT date_trunc('month', data_scadenza)::date AS m,
             sum(greatest(coalesce(totale_documento,0) - coalesce(importo_pagato,0), 0)) AS v
      FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL
        AND tipo IN ('fattura','proforma','fattura_pa','fattura_riepilogativa')
        AND data_scadenza IS NOT NULL AND data_scadenza >= date_trunc('month', now())::date
        AND coalesce(totale_documento,0) - coalesce(importo_pagato,0) > 0
      GROUP BY 1),
    rate AS (
      SELECT date_trunc('month', expected_date)::date AS m, sum(amount) AS v
      FROM v_rate_commesse_unificate
      WHERE company_id = p_company_id AND NOT is_paid
        AND expected_date IS NOT NULL AND expected_date >= date_trunc('month', now())::date
      GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Incassi attesi per scadenza (fatture + rate commesse)','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'),
        'value', round(coalesce(fatture.v,0) + coalesce(rate.v,0),2)) ORDER BY months.m), '[]'::jsonb),
      'fonti', jsonb_build_object(
        'fatture_residuo_eur', round(coalesce((SELECT sum(v) FROM fatture),0),2),
        'rate_commesse_future_eur', round(coalesce((SELECT sum(v) FROM rate),0),2)))
    INTO res FROM months LEFT JOIN fatture ON fatture.m = months.m LEFT JOIN rate ON rate.m = months.m;

  ELSE
    res := jsonb_build_object('ok', false, 'error', 'metric non supportata',
      'metriche_disponibili', jsonb_build_array('fatturato_mensile','venduto_mensile','incassi_mensili','cantieri_per_stato','documenti_per_tipo','preventivi_per_stato','lead_per_fonte','scadenze_incassi'));
  END IF;

  RETURN res;
END $function$;

-- ─── 3) company_kpi: rate scadute dalla vista + incassato multi-fonte ───────
create or replace function public.silvio_tool_company_kpi(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_employees int;
  v_orders_active int;
  v_orders_ytd int;
  v_revenue_ytd numeric;
  v_quotes_open int;
  v_overdue_count int;
  v_overdue_amount numeric;
  v_bank_balance numeric;
  v_bank_accounts int := 0;
  v_inc_rate_ytd numeric;
  v_inc_fatture_ytd numeric;
  v_fatture_emesse int;
BEGIN
  SELECT count(*) INTO v_employees
    FROM public.profiles WHERE company_id = p_company_id;

  SELECT count(*) INTO v_orders_active
    FROM public.orders WHERE company_id = p_company_id
      AND COALESCE(balance_paid, false) = false;

  SELECT count(*), COALESCE(sum(total_amount), 0) INTO v_orders_ytd, v_revenue_ytd
    FROM public.orders WHERE company_id = p_company_id
      AND created_at >= date_trunc('year', CURRENT_DATE);

  BEGIN
    SELECT count(*) INTO v_quotes_open
      FROM public.quotes WHERE company_id = p_company_id
        AND status IN ('draft', 'sent', 'pending', 'aperto', 'inviato');
  EXCEPTION WHEN OTHERS THEN v_quotes_open := NULL; END;

  -- Rate scadute dalla vista unificata: include order_installments E colonne
  -- legacy senza doppio conteggio (prima leggeva solo le colonne legacy).
  SELECT count(*), COALESCE(sum(amount), 0) INTO v_overdue_count, v_overdue_amount
    FROM public.v_rate_commesse_unificate
   WHERE company_id = p_company_id AND NOT is_paid AND expected_date < CURRENT_DATE;

  -- Incassato anno corrente per fonte
  SELECT COALESCE(sum(amount), 0) INTO v_inc_rate_ytd
    FROM public.v_rate_commesse_unificate
   WHERE company_id = p_company_id AND is_paid
     AND paid_date >= date_trunc('year', CURRENT_DATE);

  SELECT COALESCE(sum(coalesce(importo_pagato,0)), 0) INTO v_inc_fatture_ytd
    FROM public.documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND pagato_at >= date_trunc('year', CURRENT_DATE);

  SELECT count(*) INTO v_fatture_emesse
    FROM public.documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','autofattura','fattura_riepilogativa')
     AND stato <> 'bozza';

  BEGIN
    SELECT COALESCE(sum(current_balance), 0), count(*) INTO v_bank_balance, v_bank_accounts
      FROM public.bank_accounts WHERE company_id = p_company_id
        AND COALESCE(is_archived, false) = false;
  EXCEPTION WHEN OTHERS THEN v_bank_balance := NULL; v_bank_accounts := 0; END;

  RETURN jsonb_build_object(
    'aggiornato_al', now(),
    'team_size', v_employees,
    'commesse_attive', v_orders_active,
    'commesse_anno_corrente', v_orders_ytd,
    'venduto_anno_corrente_eur', round(v_revenue_ytd::numeric, 2),
    'fatturato_anno_corrente_eur', round(v_revenue_ytd::numeric, 2), -- alias storico: è il VENDUTO commesse
    'incassato_anno_corrente_eur', round((v_inc_rate_ytd + v_inc_fatture_ytd)::numeric, 2),
    'incassato_da_rate_commesse_eur', round(v_inc_rate_ytd::numeric, 2),
    'incassato_da_fatture_eur', round(v_inc_fatture_ytd::numeric, 2),
    'fatture_emesse_count', v_fatture_emesse,
    'usa_fatturazione_eic', v_fatture_emesse > 0,
    'preventivi_aperti', v_quotes_open,
    'rate_scadute_count', v_overdue_count,
    'rate_scadute_eur', round(v_overdue_amount::numeric, 2),
    'banca_collegata', v_bank_accounts > 0,
    'saldo_banche_totale_eur', CASE WHEN v_bank_accounts > 0 AND v_bank_balance IS NOT NULL THEN round(v_bank_balance::numeric, 2) ELSE NULL END,
    'nota_lettura', 'Venduto (commesse) ≠ fatturato ≠ incassato. Se usa_fatturazione_eic=false l''azienda fattura fuori piattaforma: gli incassi veri sono quelli sulle rate commesse, NON dire che non ci sono incassi.'
  );
END;
$function$;

-- ─── 4) lista_scadenze: fatture CRM + fatture fiscali + rate commesse ───────
create or replace function public.silvio_tool_lista_scadenze(p_company_id uuid, p_user_id uuid, p_days_ahead integer default 30, p_only_unpaid boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_result jsonb;
  v_today date := CURRENT_DATE;
  v_limit_date date := CURRENT_DATE + GREATEST(1, LEAST(COALESCE(p_days_ahead, 30), 365));
BEGIN
  WITH unificate AS (
    -- Fatture CRM legacy (tabella invoices)
    SELECT
      i.id::text AS rif_id,
      'fattura_crm'::text AS fonte,
      COALESCE(NULLIF(btrim(i.client_company_name), ''),
               NULLIF(btrim(mc.company_name), ''),
               NULLIF(btrim(COALESCE(mc.first_name, '') || ' ' || COALESCE(mc.last_name, '')), ''),
               NULLIF(btrim(i.client_email), ''), 'Cliente senza nome') AS cliente,
      COALESCE('Fattura ' || NULLIF(i.invoice_number, ''), 'Fattura') AS descrizione,
      COALESCE(i.total, 0)::numeric AS importo,
      GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0)::numeric AS residuo,
      i.due_date AS scadenza
    FROM public.invoices i
    LEFT JOIN public.marketing_contacts mc ON mc.id = i.client_id
    WHERE i.company_id = p_company_id
      AND i.due_date IS NOT NULL AND i.due_date <= v_limit_date
      AND (NOT p_only_unpaid OR COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0) > 0
           OR i.status IN ('unpaid', 'overdue', 'sent', 'draft', 'da_pagare', 'parziale'))
    UNION ALL
    -- Fatture fiscali EiC non saldate
    SELECT
      d.id::text, 'fattura_fiscale',
      COALESCE(NULLIF(btrim(d.cliente_snapshot->>'denominazione'), ''), 'Cliente senza nome'),
      COALESCE('Fattura ' || NULLIF(d.numero, ''), 'Fattura'),
      COALESCE(d.totale_documento, 0)::numeric,
      GREATEST(COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0), 0)::numeric,
      d.data_scadenza
    FROM public.documenti_fiscali d
    WHERE d.company_id = p_company_id AND d.deleted_at IS NULL
      AND d.tipo IN ('fattura','fattura_pa','fattura_riepilogativa')
      AND d.data_scadenza IS NOT NULL AND d.data_scadenza <= v_limit_date
      AND (NOT p_only_unpaid OR COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0) > 0)
    UNION ALL
    -- Rate commesse non pagate (vista unificata: rate DB > colonne legacy)
    SELECT
      r.order_id::text, 'rata_commessa',
      COALESCE(NULLIF(btrim(r.client_name), ''), 'Cliente senza nome'),
      r.label || ' commessa',
      r.amount, r.amount, r.expected_date
    FROM public.v_rate_commesse_unificate r
    WHERE r.company_id = p_company_id AND NOT r.is_paid
      AND r.expected_date IS NOT NULL AND r.expected_date <= v_limit_date
  )
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total_amount_eur', round(COALESCE(SUM(importo), 0)::numeric, 2),
    'remaining_amount_eur', round(COALESCE(SUM(residuo), 0)::numeric, 2),
    'overdue_count', COUNT(*) FILTER (WHERE scadenza < v_today),
    'overdue_amount_eur', round(COALESCE(SUM(residuo) FILTER (WHERE scadenza < v_today), 0)::numeric, 2),
    'fonti', jsonb_build_object(
      'fatture_crm', COUNT(*) FILTER (WHERE fonte = 'fattura_crm'),
      'fatture_fiscali', COUNT(*) FILTER (WHERE fonte = 'fattura_fiscale'),
      'rate_commesse', COUNT(*) FILTER (WHERE fonte = 'rata_commessa')),
    'scadenze', COALESCE(jsonb_agg(
      jsonb_build_object(
        'rif_id', rif_id,
        'fonte', fonte,
        'cliente', cliente,
        'descrizione', descrizione,
        'amount_total_eur', round(importo, 2),
        'remaining_amount_eur', round(residuo, 2),
        'due_date', scadenza,
        'days_to_due', scadenza - v_today
      ) ORDER BY scadenza ASC
    ) FILTER (WHERE rif_id IS NOT NULL), '[]'::jsonb)
  )
  INTO v_result
  FROM (SELECT * FROM unificate ORDER BY scadenza ASC LIMIT 100) sub;

  RETURN COALESCE(v_result,
    jsonb_build_object('count', 0, 'remaining_amount_eur', 0, 'scadenze', '[]'::jsonb));
END;
$function$;

-- ─── 5) pipeline_forecast: opportunità CRM + preventivi (dedup via link) ────
create or replace function public.silvio_tool_get_pipeline_forecast(p_company_id uuid, p_horizon_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_opp_total numeric; v_opp_weighted numeric; v_opp_count int; v_opp_senza_valore int;
  v_q_total numeric; v_q_weighted numeric; v_q_count int;
BEGIN
  -- Opportunità CRM aperte (anche senza preventivo: molte aziende fanno
  -- preventivi cartacei fuori piattaforma)
  SELECT COALESCE(SUM(COALESCE(value,0)), 0),
         COALESCE(SUM(COALESCE(value,0) * COALESCE(probability, 50) / 100.0), 0),
         count(*),
         count(*) FILTER (WHERE COALESCE(value,0) = 0)
    INTO v_opp_total, v_opp_weighted, v_opp_count, v_opp_senza_valore
  FROM public.marketing_opportunities
  WHERE company_id = p_company_id AND status = 'open' AND deleted_at IS NULL;

  -- Preventivi aperti NON collegati a un'opportunità (quelli collegati sono
  -- già rappresentati dall'opportunità: niente doppio conteggio)
  SELECT COALESCE(SUM(total), 0),
         COALESCE(SUM(total * COALESCE(ai_close_probability_pct, 50) / 100.0), 0),
         count(*)
    INTO v_q_total, v_q_weighted, v_q_count
  FROM public.quotes
  WHERE company_id = p_company_id
    AND status IN ('sent','viewed','negotiating')
    AND signed_at IS NULL AND refused_at IS NULL
    AND opportunity_id IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'horizon_days', p_horizon_days,
    'pipeline_total_eur', round((v_opp_total + v_q_total)::numeric, 2),
    'pipeline_weighted_eur', round((v_opp_weighted + v_q_weighted)::numeric, 2),
    'fonti', jsonb_build_object(
      'opportunita_aperte', jsonb_build_object('count', v_opp_count, 'totale_eur', round(v_opp_total::numeric,2), 'weighted_eur', round(v_opp_weighted::numeric,2), 'senza_valore_count', v_opp_senza_valore),
      'preventivi_non_collegati', jsonb_build_object('count', v_q_count, 'totale_eur', round(v_q_total::numeric,2), 'weighted_eur', round(v_q_weighted::numeric,2))),
    'quotes_count', v_q_count,
    'forecast_30d_eur', round(((v_opp_weighted + v_q_weighted) * 0.3)::numeric, 2),
    'forecast_60d_eur', round(((v_opp_weighted + v_q_weighted) * 0.6)::numeric, 2),
    'forecast_90d_eur', round((v_opp_weighted + v_q_weighted)::numeric, 2),
    'nota_lettura', CASE WHEN v_opp_senza_valore > 0
      THEN v_opp_senza_valore || ' opportunità aperte non hanno valore stimato: la pipeline reale è probabilmente più alta. Suggerisci di valorizzarle.'
      ELSE NULL END
  );
END $function$;

-- ─── 6) NUOVO: quadro incassi multi-fonte con riconciliazione ───────────────
create or replace function public.silvio_tool_quadro_incassi(p_company_id uuid, p_mesi integer default 3)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  n int := greatest(1, least(coalesce(p_mesi, 3), 24));
  da date := (date_trunc('month', now()) - ((greatest(1, least(coalesce(p_mesi,3),24)) - 1) || ' months')::interval)::date;
  v_venduto numeric; v_n_ordini int;
  v_inc_rate numeric; v_inc_fatture numeric; v_inc_pn_manuale numeric := 0;
  v_rate_future numeric; v_rate_scadute numeric; v_fatture_residuo numeric;
  v_fatture_emesse int;
  v_n_conti int := 0; v_banca_in numeric; v_banca_out numeric;
  v_pn_uscite numeric := 0;
  v_avvisi jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(sum(total_amount),0), count(*) INTO v_venduto, v_n_ordini
    FROM orders WHERE company_id = p_company_id AND created_at >= da;

  SELECT COALESCE(sum(amount),0) INTO v_inc_rate
    FROM v_rate_commesse_unificate
   WHERE company_id = p_company_id AND is_paid AND paid_date >= da;

  SELECT COALESCE(sum(coalesce(importo_pagato,0)),0) INTO v_inc_fatture
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at >= da;

  SELECT count(*) INTO v_fatture_emesse
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','autofattura','fattura_riepilogativa') AND stato <> 'bozza';

  SELECT COALESCE(sum(amount) FILTER (WHERE expected_date >= CURRENT_DATE), 0),
         COALESCE(sum(amount) FILTER (WHERE expected_date < CURRENT_DATE), 0)
    INTO v_rate_future, v_rate_scadute
    FROM v_rate_commesse_unificate
   WHERE company_id = p_company_id AND NOT is_paid AND expected_date IS NOT NULL;

  SELECT COALESCE(sum(greatest(coalesce(totale_da_pagare, totale_documento, 0) - coalesce(importo_pagato,0), 0)),0)
    INTO v_fatture_residuo
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','fattura_riepilogativa');

  BEGIN
    SELECT COALESCE(sum(amount) FILTER (WHERE direction = 'entrata' AND coalesce(is_auto,false) = false), 0),
           COALESCE(sum(amount) FILTER (WHERE direction = 'uscita'), 0)
      INTO v_inc_pn_manuale, v_pn_uscite
      FROM prima_nota_entries
     WHERE company_id = p_company_id AND entry_date >= da;
  EXCEPTION WHEN OTHERS THEN v_inc_pn_manuale := 0; v_pn_uscite := 0; END;

  BEGIN
    SELECT count(*) INTO v_n_conti FROM bank_accounts
     WHERE company_id = p_company_id AND coalesce(is_archived,false) = false;
    IF v_n_conti > 0 THEN
      SELECT COALESCE(sum(CASE WHEN amount > 0 THEN amount ELSE 0 END),0),
             COALESCE(sum(CASE WHEN amount < 0 THEN abs(amount) ELSE 0 END),0)
        INTO v_banca_in, v_banca_out
        FROM bank_transactions
       WHERE company_id = p_company_id AND transaction_date >= da;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_n_conti := 0; v_banca_in := NULL; v_banca_out := NULL; END;

  -- Avvisi di riconciliazione: è QUI che il sistema "ragiona" sulle fonti
  IF v_inc_rate > 0 AND v_fatture_emesse = 0 THEN
    v_avvisi := v_avvisi || jsonb_build_array('L''azienda registra incassi sulle rate delle commesse ma NON emette fatture in EiC: la fatturazione avviene fuori piattaforma. Non concludere mai che "non ci sono incassi" guardando solo le fatture.');
  END IF;
  IF v_inc_rate > 0 AND v_inc_fatture > 0 THEN
    v_avvisi := v_avvisi || jsonb_build_array('Risultano incassi sia da fatture sia da rate commesse: la stessa entrata potrebbe essere registrata due volte. Prima di sommare, segnala il possibile overlap.');
  END IF;
  IF v_n_conti = 0 THEN
    v_avvisi := v_avvisi || jsonb_build_array('Nessun conto corrente collegato: gli incassi dichiarati non sono verificabili con la banca. Suggerisci di collegare il conto (Finanza → Tesoreria) per la riconciliazione automatica.');
  ELSE
    v_avvisi := v_avvisi || jsonb_build_array('Conto corrente collegato: confronta gli incassi registrati con le entrate banca del periodo per verificare la coerenza.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'periodo', jsonb_build_object('da', da, 'a', CURRENT_DATE, 'mesi', n),
    'venduto', jsonb_build_object('totale_eur', round(v_venduto,2), 'n_commesse', v_n_ordini),
    'incassato', jsonb_build_object(
      'rate_commesse_eur', round(v_inc_rate,2),
      'fatture_eur', round(v_inc_fatture,2),
      'prima_nota_manuale_eur', round(v_inc_pn_manuale,2),
      'nota', 'Fonti separate apposta: NON sommarle alla cieca, possono sovrapporsi (vedi avvisi).'),
    'da_incassare', jsonb_build_object(
      'rate_commesse_future_eur', round(v_rate_future,2),
      'rate_commesse_scadute_eur', round(v_rate_scadute,2),
      'fatture_residuo_eur', round(v_fatture_residuo,2)),
    'uscite', jsonb_build_object(
      'prima_nota_uscite_eur', round(v_pn_uscite,2),
      'banca_uscite_eur', CASE WHEN v_banca_out IS NOT NULL THEN round(v_banca_out,2) ELSE NULL END),
    'strumenti', jsonb_build_object(
      'usa_fatturazione_eic', v_fatture_emesse > 0,
      'fatture_emesse_count', v_fatture_emesse,
      'banca_collegata', v_n_conti > 0,
      'n_conti', v_n_conti,
      'banca_entrate_periodo_eur', CASE WHEN v_banca_in IS NOT NULL THEN round(v_banca_in,2) ELSE NULL END),
    'avvisi', v_avvisi
  );
END $function$;

grant execute on function public.silvio_tool_quadro_incassi(uuid, integer) to authenticated, service_role;
