-- Quattordicesimo controllo: numeri (19/10/2026).
--
--  1. Silvio, lista scadenze: ogni credito una volta sola. La rata della commessa vale per sé; la
--     fattura collegata a una rata non si ripete, e la fattura CRM che ha il suo documento fiscale
--     nemmeno. Fatture in bozza o annullate escluse. Totali su tutte le scadenze, non solo su quelle
--     elencate.
--  2. Silvio, cassa a 90 giorni: il ritardo dei clienti sposta gli incassi solo in avanti (un
--     anticipo medio da una sola rata non manda più tutte le rate nel passato).
--  3. Silvio, fatture restanti: totali e conteggio su tutte le rate; l'elenco dice se è tagliato.
--  4. Importi negli avvisi e nei messaggi di Silvio all'italiana (1.234,56).
--  5. Silvio, riepilogo commesse: dice quali importi sono IVA esclusa e quali inclusa.
--  6. Cruscotto di casa: gli incassi da fatture senza rata del mese finiscono a fine mese.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.sostituisci(p_firma text, p_vecchio text, p_nuovo text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuovo in v_def) > 0 then return; end if;
  if position(p_vecchio in v_def) = 0 then
    raise exception 'Testo non trovato in %: %', p_firma, left(p_vecchio, 80);
  end if;
  execute replace(v_def, p_vecchio, p_nuovo);
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.silvio_tool_lista_scadenze(p_company_id uuid, p_user_id uuid, p_days_ahead integer DEFAULT 30, p_only_unpaid boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_today date := CURRENT_DATE;
  v_limit_date date := CURRENT_DATE + GREATEST(1, LEAST(COALESCE(p_days_ahead, 30), 365));
BEGIN
  WITH unificate AS MATERIALIZED (
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
      -- la fattura che ha il suo documento fiscale compare una volta sola, come documento
      AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali d2 WHERE d2.id = i.id)
      -- la fattura collegata a una rata è già nella rata (col residuo vero)
      AND NOT EXISTS (SELECT 1 FROM public.order_installments oi WHERE oi.invoice_id = i.id)
    UNION ALL
    SELECT
      d.id::text, 'fattura_fiscale',
      COALESCE(NULLIF(btrim(d.cliente_snapshot->>'denominazione'), ''), 'Cliente senza nome'),
      COALESCE('Fattura ' || NULLIF(d.numero, ''), 'Fattura'),
      COALESCE(d.totale_documento, 0)::numeric,
      GREATEST(COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0)
               - public.documento_stornato(d.id), 0)::numeric,
      d.data_scadenza
    FROM public.documenti_fiscali d
    WHERE d.company_id = p_company_id AND d.deleted_at IS NULL
      AND d.tipo IN ('fattura','fattura_pa','fattura_riepilogativa')
      AND d.stato NOT IN ('bozza', 'annullata')
      AND d.data_scadenza IS NOT NULL AND d.data_scadenza <= v_limit_date
      AND (NOT p_only_unpaid OR COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0)
                                - public.documento_stornato(d.id) > 0)
      AND NOT EXISTS (SELECT 1 FROM public.order_installments oi WHERE oi.documento_fiscale_id = d.id)
    UNION ALL
    SELECT
      r.order_id::text, 'rata_commessa',
      r.cliente,
      r.label || ' commessa',
      r.importo, r.residuo, r.expected_date
    FROM public.rate_da_incassare_dettaglio(p_company_id) r
    WHERE r.residuo > 0 AND NOT (r.finanziamento AND r.expected_date < v_today)
      AND r.expected_date IS NOT NULL AND r.expected_date <= v_limit_date
  ),
  elencate AS (
    SELECT * FROM (
      SELECT u.*, row_number() OVER (PARTITION BY u.fonte ORDER BY u.scadenza ASC) AS posto
        FROM unificate u
    ) z
    WHERE z.posto <= 100          -- al massimo cento per fonte: nessuna resta fuori
    ORDER BY z.scadenza ASC
    LIMIT 300
  )
  SELECT jsonb_build_object(
    -- i totali contano tutte le scadenze, anche quelle che l'elenco non mostra
    'count', (SELECT COUNT(*) FROM unificate),
    'total_amount_eur', (SELECT round(COALESCE(SUM(importo), 0)::numeric, 2) FROM unificate),
    'remaining_amount_eur', (SELECT round(COALESCE(SUM(residuo), 0)::numeric, 2) FROM unificate),
    'overdue_count', (SELECT COUNT(*) FROM unificate WHERE scadenza < v_today),
    'overdue_amount_eur', (SELECT round(COALESCE(SUM(residuo) FILTER (WHERE scadenza < v_today), 0)::numeric, 2) FROM unificate),
    'mostrate', (SELECT COUNT(*) FROM elencate),
    'fonti', (SELECT jsonb_build_object(
      'fatture_crm', COUNT(*) FILTER (WHERE fonte = 'fattura_crm'),
      'fatture_fiscali', COUNT(*) FILTER (WHERE fonte = 'fattura_fiscale'),
      'rate_commesse', COUNT(*) FILTER (WHERE fonte = 'rata_commessa')) FROM unificate),
    'nota', 'Ogni credito una volta sola: la fattura collegata a una rata è dentro la rata.',
    'scadenze', COALESCE((SELECT jsonb_agg(
      jsonb_build_object(
        'rif_id', e.rif_id,
        'fonte', e.fonte,
        'cliente', e.cliente,
        'descrizione', e.descrizione,
        'amount_total_eur', round(e.importo, 2),
        'remaining_amount_eur', round(e.residuo, 2),
        'due_date', e.scadenza,
        'days_to_due', e.scadenza - v_today
      ) ORDER BY e.scadenza ASC) FROM elencate e), '[]'::jsonb)
  )
  INTO v_result;

  RETURN COALESCE(v_result,
    jsonb_build_object('count', 0, 'remaining_amount_eur', 0, 'scadenze', '[]'::jsonb));
END;
$function$;
revoke all on function public.silvio_tool_lista_scadenze(uuid, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.silvio_tool_lista_scadenze(uuid, uuid, integer, boolean) to service_role;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.silvio_cashflow_forecast_90d(uuid,integer,boolean)',
  $v$  v_avg_delay := COALESCE((v_pattern->>'avg_delay_days_global')::int, 0);$v$,
  $n$  -- il ritardo sposta gli incassi solo in avanti: un anticipo medio non li porta nel passato
  v_avg_delay := GREATEST(0, COALESCE((v_pattern->>'avg_delay_days_global')::int, 0));$n$);
select pg_temp.sostituisci('public.silvio_cashflow_forecast_90d(uuid,integer,boolean)',
  $v$THEN r.expected_date + ((v_pattern->'delays_per_client'->>COALESCE(o.client_name, o.client_company, ''))::int)$v$,
  $n$THEN r.expected_date + GREATEST(0, (v_pattern->'delays_per_client'->>COALESCE(o.client_name, o.client_company, ''))::int)$n$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.silvio_tool_fatture_restanti(uuid,uuid,boolean,integer)',
  $v$  SELECT
    COUNT(*),
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(residuo), 0),$v$,
  $n$  SELECT
    -- totali su tutte le rate; l'elenco ne mostra al massimo v_limit
    (SELECT COUNT(*) FROM all_rows),
    (SELECT COALESCE(SUM(amount), 0) FROM all_rows),
    (SELECT COALESCE(SUM(residuo), 0) FROM all_rows),$n$);
select pg_temp.sostituisci('public.silvio_tool_fatture_restanti(uuid,uuid,boolean,integer)',
  $v$    'count', COALESCE(v_count, 0),$v$,
  $n$    'count', COALESCE(v_count, 0),
    'mostrate', jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)),
    'troncato', COALESCE(v_count, 0) > jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)),$n$);

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.silvio_detect_alerts(uuid)',
  $v$to_char(s.importo, 'FM999G999D90')$v$,
  $n$translate(to_char(s.importo, 'FM999,999,999,990.00'), ',.', '.,')$n$);
select pg_temp.sostituisci('public.silvio_detect_alerts(uuid)',
  $v$to_char(q.total, 'FM999G999D90')$v$,
  $n$translate(to_char(q.total, 'FM999,999,999,990.00'), ',.', '.,')$n$);
select pg_temp.sostituisci('public.silvio_detect_cashflow_alerts(uuid)',
  $v$to_char(v_min_balance, 'FM999G999D90')$v$,
  $n$translate(to_char(v_min_balance, 'FM999,999,999,990.00'), ',.', '.,')$n$);
select pg_temp.sostituisci((select p.oid::regprocedure::text from pg_proc p
                            where p.pronamespace = 'public'::regnamespace and p.proname = 'silvio_create_invoice_draft' limit 1),
  $v$to_char(v_amount, 'FM999G999D90')$v$,
  $n$translate(to_char(v_amount, 'FM999,999,999,990.00'), ',.', '.,')$n$);
select pg_temp.sostituisci((select p.oid::regprocedure::text from pg_proc p
                            where p.pronamespace = 'public'::regnamespace and p.proname = 'silvio_tool_crea_proposta_ordine_fornitore' limit 1),
  $v$to_char(COALESCE(p_total_amount_eur, 0), 'FM999G999G990D00')$v$,
  $n$translate(to_char(COALESCE(p_total_amount_eur, 0), 'FM999,999,999,990.00'), ',.', '.,')$n$);

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.silvio_tool_orders_summary(uuid,text,integer)',
  $v$    'nota_dati', 'cliente risolto da orders.client_name/client_company oppure orders.customer_id -> profiles',$v$,
  $n$    'nota_dati', 'cliente risolto da orders.client_name/client_company oppure orders.customer_id -> profiles',
    'nota_importi', 'valore_eur e valore_totale_eur sono IVA esclusa (contratto più varianti approvate); da_incassare_eur è IVA inclusa, come nella scheda commessa.',$n$);

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  v_real_income := v_real_income + coalesce(public.incassi_fatture_senza_rata(p_company_id, v_month_start::date), 0);$v$,
  $n$  v_real_income := v_real_income + coalesce(public.incassi_fatture_senza_rata(p_company_id, v_month_start::date), 0)
                                  - coalesce(public.incassi_fatture_senza_rata(p_company_id, v_month_end::date), 0);$n$);
