-- Strumenti di Silvio sulla regola unica delle rate (19/10/2026).
--
-- Gli strumenti che leggevano i campi di saldo della commessa (orders.deposit_*/balance_*) o le viste
-- v_rate_commesse_unificate / v_rate_commesse_dettaglio leggono ora la stessa regola della scheda
-- commessa: rate_importi (il saldo è il residuo), rate_da_incassare (residuo per rata, mai oltre il
-- totale meno l'incassato), rate_incassi (incassi per data). Commesse nel cestino escluse; la rata della
-- finanziaria non è mai tra gli scaduti.
--
--  1. rate_da_incassare_dettaglio: le rate da incassare con commessa, cliente, tipo ed etichetta.
--  2. Lista scadenze, previsione incassi, fabbisogno del mese, cassa a 90 giorni, simulazione.
--  3. Riepilogo commesse e ricerca: da incassare e prossima rata dalla regola.
--  4. Fatture restanti: rate da fatturare dalla regola, col residuo.
--  5. Ritardo medio dei clienti: dalle rate incassate (piano rate e piano storico).
--  6. Avvisi delle rate scadute, controlli anomalie, riepilogo del mattino.
--  7. Provvigione sull'incassato: dagli incassi della regola.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Sostituisce il testo compreso tra due frammenti (inclusi). Idempotente: se il testo nuovo c'è già,
-- non fa niente; se un frammento manca, si ferma.
create or replace function pg_temp.tra(p_firma text, p_da text, p_a text, p_nuovo text)
returns void language plpgsql as $$
declare v_def text; i int; j int;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuovo in v_def) > 0 then return; end if;
  i := position(p_da in v_def);
  if i = 0 then raise exception 'Inizio non trovato in %: %', p_firma, left(p_da, 80); end if;
  j := position(p_a in substr(v_def, i));
  if j = 0 then raise exception 'Fine non trovata in %: %', p_firma, left(p_a, 80); end if;
  execute left(v_def, i - 1) || p_nuovo || substr(v_def, i + j - 1 + length(p_a));
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_da_incassare_dettaglio(p_company uuid)
returns table (order_id uuid, installment_id uuid, order_code text, cliente text, client_email text,
               tipo text, label text, importo numeric, residuo numeric, expected_date date, finanziamento boolean)
language sql stable security definer set search_path = public
as $$
  with ri as materialized (select * from public.rate_importi(p_company))
  select d.order_id, d.installment_id,
         coalesce(nullif(btrim(o.order_code), ''), 'Commessa senza codice'),
         coalesce(nullif(btrim(o.client_name), ''), nullif(btrim(o.client_company), ''), 'Cliente non indicato'),
         nullif(btrim(o.client_email), ''),
         coalesce(ri.type, 'non_pianificato'),
         coalesce(nullif(btrim(oi.label), ''),
                  case when ri.type is null then 'Parte non pianificata'
                       when ri.type = 'deposit' then 'Acconto' when ri.type = 'balance' then 'Saldo'
                       when ri.type = 'financing' then 'Finanziamento' else 'Rata' end),
         coalesce(ri.importo, d.residuo), d.residuo, d.expected_date, d.finanziamento
    from public.rate_da_incassare(p_company) d
    join public.orders o on o.id = d.order_id
    left join ri on ri.installment_id = d.installment_id
    left join public.order_installments oi on oi.id = d.installment_id
$$;
revoke all on function public.rate_da_incassare_dettaglio(uuid) from public, anon, authenticated;
grant execute on function public.rate_da_incassare_dettaglio(uuid) to service_role;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
-- Lista scadenze: le rate col residuo vero; quella della finanziaria non compare tra le scadute.
select pg_temp.tra('public.silvio_tool_lista_scadenze(uuid,uuid,integer,boolean)',
  $v$      r.order_id::text, 'rata_commessa',$v$,
  $v$r.expected_date IS NOT NULL AND r.expected_date <= v_limit_date$v$,
  $n$      r.order_id::text, 'rata_commessa',
      r.cliente,
      r.label || ' commessa',
      r.importo, r.residuo, r.expected_date
    FROM public.rate_da_incassare_dettaglio(p_company_id) r
    WHERE r.residuo > 0 AND NOT (r.finanziamento AND r.expected_date < v_today)
      AND r.expected_date IS NOT NULL AND r.expected_date <= v_limit_date$n$);

-- Previsione incassi: rate future col residuo; gli scaduti esclusi senza la rata della finanziaria.
create or replace function public.silvio_tool_revenue_forecast(p_company_id uuid, p_days_ahead integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days int := LEAST(GREATEST(COALESCE(p_days_ahead, 30), 1), 365);
  v_until date; v_orders_count int := 0; v_total_due numeric := 0; v_future_count int := 0;
  v_overdue_excluded numeric := 0; v_senza_data numeric := 0; v_breakdown jsonb := '[]'::jsonb;
  v_per_tipo jsonb := '{}'::jsonb; v_warnings text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_until := (CURRENT_DATE + (v_days || ' days')::interval)::date;
  SELECT COUNT(*) INTO v_orders_count FROM public.orders WHERE company_id = p_company_id AND deleted_at IS NULL;
  -- Rate da incassare con la regola della scheda commessa (residuo vero, niente cestino).
  WITH r AS MATERIALIZED (
    SELECT * FROM public.rate_da_incassare_dettaglio(p_company_id) x WHERE x.residuo > 0
  ), due AS (
    SELECT r.order_code, r.cliente, r.tipo, r.label, r.residuo AS importo_eur, r.expected_date AS data_attesa
      FROM r WHERE r.expected_date BETWEEN CURRENT_DATE AND v_until
  )
  SELECT COALESCE(SUM(importo_eur), 0), COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'commessa', order_code, 'cliente', cliente, 'tipo_rata', tipo, 'rata', label,
      'importo_eur', ROUND(importo_eur::numeric, 2), 'data_attesa', data_attesa,
      'giorni_a_scadenza', data_attesa - CURRENT_DATE,
      'priorita', CASE WHEN data_attesa <= CURRENT_DATE + 7 THEN 'alta'
                       WHEN data_attesa <= CURRENT_DATE + 30 THEN 'media' ELSE 'bassa' END
    ) ORDER BY data_attesa ASC, importo_eur DESC), '[]'::jsonb),
    (SELECT COALESCE(jsonb_object_agg(t.tipo, t.tot), '{}'::jsonb)
       FROM (SELECT d2.tipo, ROUND(SUM(d2.importo_eur)::numeric, 2) AS tot FROM due d2 GROUP BY d2.tipo) t),
    (SELECT COALESCE(SUM(r2.residuo), 0) FROM r r2 WHERE r2.expected_date < CURRENT_DATE AND NOT r2.finanziamento),
    (SELECT COALESCE(SUM(r3.residuo), 0) FROM r r3
      WHERE r3.expected_date IS NULL OR (r3.expected_date < CURRENT_DATE AND r3.finanziamento))
  INTO v_total_due, v_future_count, v_breakdown, v_per_tipo, v_overdue_excluded, v_senza_data
  FROM due;
  IF v_orders_count = 0 THEN v_warnings := array_append(v_warnings, 'orders_missing'); END IF;
  IF v_future_count = 0 THEN v_warnings := array_append(v_warnings, 'future_receivables_missing'); END IF;
  RETURN jsonb_build_object(
    'orizzonte_giorni', v_days, 'dal', CURRENT_DATE, 'data_limite', v_until,
    'totale_da_incassare_eur', ROUND(v_total_due::numeric, 2), 'total_expected_eur', ROUND(v_total_due::numeric, 2),
    'future_receivables_count', v_future_count, 'expected_count', v_future_count,
    'scaduti_esclusi_eur', ROUND(v_overdue_excluded::numeric, 2), 'overdue_excluded_eur', ROUND(v_overdue_excluded::numeric, 2),
    'senza_data_eur', ROUND(v_senza_data::numeric, 2),
    'nota', 'Il forecast include solo incassi futuri con data. I crediti gia scaduti sono esclusi e vanno letti con get_overdue_payments; senza_data_eur e la parte da incassare ancora senza data (rate non datate, parte non pianificata, finanziamento in attesa).',
    'data_quality', jsonb_build_object('orders_count', v_orders_count, 'future_receivables_count', v_future_count,
      'fonte_rate', 'regola della scheda commessa (rate_da_incassare)', 'warnings', to_jsonb(v_warnings)),
    'breakdown', v_per_tipo, 'top_commesse', v_breakdown, 'incassi_futuri', v_breakdown);
END;
$function$;
revoke all on function public.silvio_tool_revenue_forecast(uuid, integer) from public, anon;

-- Fabbisogno del mese: incassi attesi e scaduti dalla regola.
select pg_temp.tra('public.silvio_tool_revenue_needed_next_month(uuid,date,numeric)',
  $v$  SELECT COUNT(*) INTO v_orders_count
  FROM public.orders WHERE company_id = p_company_id;$v$,
  $v$  FROM public.orders WHERE company_id = p_company_id;$v$,
  $n$  SELECT COUNT(*) INTO v_orders_count
  FROM public.orders WHERE company_id = p_company_id AND deleted_at IS NULL;$n$);
select pg_temp.tra('public.silvio_tool_revenue_needed_next_month(uuid,date,numeric)',
  $v$  -- Rate clienti dalla VISTA UNIFICATA$v$,
  $v$      AND r.amount > 0
  )$v$,
  $n$  -- Rate clienti con la regola della scheda commessa: residuo vero, niente cestino; la rata della
  -- finanziaria non è tra le scadute.
  WITH receivables AS (
    SELECT r.order_code, r.cliente, lower(r.label) AS tipo, r.residuo AS importo_eur, r.expected_date AS data_attesa
      FROM public.rate_da_incassare_dettaglio(p_company_id) r
     WHERE r.expected_date IS NOT NULL AND r.residuo > 0
       AND NOT (r.finanziamento AND r.expected_date < CURRENT_DATE)
  )$n$);

-- Cassa a 90 giorni: le rate lette una volta sola, spostate del ritardo medio del cliente.
create or replace function public.silvio_cashflow_forecast_90d(p_company_id uuid, p_weeks integer DEFAULT 13, p_apply_delay boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance_today numeric := 0; v_pattern jsonb; v_avg_delay int;
  v_weeks_data jsonb := '[]'::jsonb; v_week_start date; v_week_end date;
  v_week_in numeric; v_week_out numeric; v_running numeric;
  v_critical_weeks int := 0; v_warning_weeks int := 0; v_min_balance numeric;
  v_min_week_start date; v_total_in_90d numeric := 0; v_total_out_90d numeric := 0;
  v_monthly_payroll numeric := 0; v_in_weeks numeric[];
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  BEGIN
    SELECT COALESCE(SUM(current_balance), 0) INTO v_balance_today
    FROM public.bank_accounts
    WHERE company_id = p_company_id
      AND COALESCE(is_active, true) = true;
  EXCEPTION WHEN OTHERS THEN v_balance_today := 0; END;

  v_pattern := public.silvio_payment_delay_pattern(p_company_id);
  v_avg_delay := COALESCE((v_pattern->>'avg_delay_days_global')::int, 0);

  BEGIN
    SELECT COALESCE(SUM(net_salary), 0) INTO v_monthly_payroll
    FROM public.employees
    WHERE company_id = p_company_id AND COALESCE(is_active, true) = true;
  EXCEPTION WHEN OTHERS THEN v_monthly_payroll := 0; END;

  -- Incassi attesi per settimana: rate da incassare con la regola della scheda commessa.
  SELECT array_agg(COALESCE(x.s, 0) ORDER BY w.i) INTO v_in_weeks
    FROM generate_series(0, p_weeks - 1) w(i)
    LEFT JOIN (
      SELECT (e.quando - CURRENT_DATE) / 7 AS i, SUM(e.residuo) AS s
        FROM (
          SELECT r.residuo,
                 CASE
                   WHEN p_apply_delay AND v_pattern->'delays_per_client' ? COALESCE(o.client_name, o.client_company, '')
                     THEN r.expected_date + ((v_pattern->'delays_per_client'->>COALESCE(o.client_name, o.client_company, ''))::int)
                   WHEN p_apply_delay THEN r.expected_date + v_avg_delay
                   ELSE r.expected_date
                 END AS quando
            FROM public.rate_da_incassare(p_company_id) r
            JOIN public.orders o ON o.id = r.order_id
           WHERE r.expected_date IS NOT NULL AND r.residuo > 0
        ) e
       WHERE e.quando >= CURRENT_DATE AND e.quando < CURRENT_DATE + p_weeks * 7
       GROUP BY 1
    ) x ON x.i = w.i;

  v_running := v_balance_today; v_min_balance := v_balance_today; v_min_week_start := CURRENT_DATE;

  FOR i IN 0..(p_weeks - 1) LOOP
    v_week_start := CURRENT_DATE + (i * 7);
    v_week_end := v_week_start + 6;
    v_week_in := COALESCE(v_in_weeks[i + 1], 0);

    BEGIN
      SELECT COALESCE(SUM(totale_documento), 0) INTO v_week_out
      FROM public.fatture_ricevute
      WHERE company_id = p_company_id
        AND data_fattura + interval '60 days' BETWEEN v_week_start AND v_week_end
        AND COALESCE(totale_documento, 0) > 0;
    EXCEPTION WHEN OTHERS THEN v_week_out := 0; END;

    v_week_out := v_week_out + (v_monthly_payroll / 4.33);
    v_running := v_running + v_week_in - v_week_out;
    v_total_in_90d := v_total_in_90d + v_week_in;
    v_total_out_90d := v_total_out_90d + v_week_out;

    IF v_running < v_min_balance THEN v_min_balance := v_running; v_min_week_start := v_week_start; END IF;
    IF v_running < 0 THEN v_critical_weeks := v_critical_weeks + 1; END IF;
    IF v_running >= 0 AND v_running < (v_balance_today * 0.10) THEN v_warning_weeks := v_warning_weeks + 1; END IF;

    v_weeks_data := v_weeks_data || jsonb_build_object(
      'week_index', i + 1, 'week_start', v_week_start, 'week_end', v_week_end,
      'incassi_eur', round(v_week_in::numeric, 2), 'uscite_eur', round(v_week_out::numeric, 2),
      'cashflow_netto_eur', round((v_week_in - v_week_out)::numeric, 2),
      'saldo_atteso_eur', round(v_running::numeric, 2),
      'status', CASE WHEN v_running < 0 THEN 'critical'
                     WHEN v_running < (v_balance_today * 0.10) THEN 'warning' ELSE 'ok' END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'aggiornato_al', now(), 'saldo_oggi_eur', round(v_balance_today::numeric, 2),
    'orizzonte_settimane', p_weeks, 'delay_pattern', v_pattern,
    'costo_personale_mensile_netto_eur', round(v_monthly_payroll::numeric, 2),
    'totale_incassi_previsti_eur', round(v_total_in_90d::numeric, 2),
    'totale_uscite_previste_eur', round(v_total_out_90d::numeric, 2),
    'saldo_atteso_fine_periodo_eur', round(v_running::numeric, 2),
    'saldo_minimo_eur', round(v_min_balance::numeric, 2), 'settimana_critica', v_min_week_start,
    'critical_weeks_count', v_critical_weeks, 'warning_weeks_count', v_warning_weeks, 'weeks', v_weeks_data
  );
END;
$function$;
revoke all on function public.silvio_cashflow_forecast_90d(uuid, integer, boolean) from public, anon;

-- Simulazione: le leve sono le rate da incassare più grandi, col residuo.
select pg_temp.tra('public.silvio_tool_simula_scenario(uuid,text,integer,jsonb)',
  $v$'importo', ROUND(r.amount::numeric, 2)$v$,
  $v$ORDER BY r.amount DESC LIMIT 3$v$,
  $n$'importo', ROUND(r.residuo::numeric, 2), 'atteso_il', r.expected_date) AS e
      FROM public.rate_da_incassare_dettaglio(p_company_id) r
      WHERE r.residuo > 0 AND r.expected_date IS NOT NULL
        AND r.expected_date <= CURRENT_DATE + (v_mesi * 30)
      ORDER BY r.residuo DESC LIMIT 3$n$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
-- Riepilogo commesse: la prossima rata e «incassata tutta» dalla regola, al posto dei campi del saldo.
select pg_temp.tra('public.silvio_tool_orders_summary(uuid,text,integer)',
  $v$    LEFT JOIN (select x.order_id, sum(x.residuo) r from public.rate_da_incassare(p_company_id) x group by x.order_id) di ON di.order_id = o.id
    LEFT JOIN public.profiles p$v$,
  $v$    LEFT JOIN public.profiles p$v$,
  $n$    LEFT JOIN (select x.order_id, sum(x.residuo) r, min(x.expected_date) filter (where x.residuo > 0) prossima
                 from public.rate_da_incassare(p_company_id) x group by x.order_id) di ON di.order_id = o.id
    LEFT JOIN public.profiles p$n$);
select pg_temp.tra('public.silvio_tool_orders_summary(uuid,text,integer)',
  $v$      'expected_date', o.expected_date,$v$,
  $v$      'balance_paid', o.balance_paid,$v$,
  $n$      'prossima_rata_il', di.prossima,
      'warehouse_arrival_date', o.warehouse_arrival_date,
      'incassata_tutta', coalesce(di.r, 0) <= 0,$n$);

-- Ricerca commesse: da incassare e prossima rata dalla regola, senza il cestino.
create or replace function public.silvio_tool_search_orders(p_company_id uuid, p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_results jsonb;
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF length(v_query) < 2 THEN
    RETURN jsonb_build_object('error', 'query troppo corta (min 2 caratteri)');
  END IF;

  WITH di AS MATERIALIZED (
    SELECT x.order_id, sum(x.residuo) AS r, min(x.expected_date) FILTER (WHERE x.residuo > 0) AS prossima
      FROM public.rate_da_incassare(p_company_id) x GROUP BY x.order_id
  )
  SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
  INTO v_results
  FROM (
    SELECT jsonb_build_object(
      'order_id', o.id,
      'order_code', o.order_code,
      'customer_id', o.customer_id,
      'cliente', public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email),
      'customer_email', p.email,
      'descrizione_lavoro', o.description,
      'indirizzo_lavori', o.indirizzo_lavori,
      'stato', os.name,
      'valore_eur', round(COALESCE(o.total_amount, 0)::numeric, 2),
      'da_incassare_eur', round(COALESCE(di.r, 0)::numeric, 2),
      'prossima_rata_il', di.prossima,
      'percentuale_avanzamento', o.percentuale_avanzamento,
      'work_start_date', o.work_start_date,
      'work_end_date', o.work_end_date,
      'warehouse_arrival_date', o.warehouse_arrival_date,
      'created_at', o.created_at
    ) AS row_data
    FROM public.commesse_valore_pattuito o
    LEFT JOIN di ON di.order_id = o.id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = p_company_id
      AND (
        o.order_code ILIKE '%' || v_query || '%' OR
        o.client_name ILIKE '%' || v_query || '%' OR
        o.client_company ILIKE '%' || v_query || '%' OR
        o.description ILIKE '%' || v_query || '%' OR
        o.indirizzo_lavori ILIKE '%' || v_query || '%' OR
        p.first_name ILIKE '%' || v_query || '%' OR
        p.last_name ILIKE '%' || v_query || '%' OR
        p.email ILIKE '%' || v_query || '%'
      )
    ORDER BY o.created_at DESC
    LIMIT 15
  ) s;

  RETURN jsonb_build_object(
    'query', v_query,
    'totale_match', COALESCE(jsonb_array_length(v_results), 0),
    'nota_dati', 'i risultati includono order_id: usalo per azioni successive come create_invoice_draft. valore_eur è imponibile con le varianti approvate; da_incassare_eur è IVA inclusa, con la regola della scheda commessa.',
    'risultati', COALESCE(v_results, '[]'::jsonb)
  );
END;
$function$;

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
-- Fatture restanti: le rate dalla regola (il saldo è il residuo). Una rata del piano storico, che non
-- ha ancora una riga in order_installments, si può trasformare in bozza di fattura.
create or replace function public.silvio_tool_fatture_restanti(p_company_id uuid, p_user_id uuid, p_only_unpaid boolean DEFAULT true, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_rows jsonb;
  v_count int;
  v_total numeric;
  v_residuo numeric;
BEGIN
  WITH ri AS MATERIALIZED (SELECT * FROM public.rate_importi(p_company_id)),
  d AS MATERIALIZED (SELECT * FROM public.rate_da_incassare(p_company_id)),
  all_rows AS (
    SELECT
      CASE WHEN oi.id IS NOT NULL THEN ri.installment_id END AS installment_id,
      o.id AS order_id,
      o.order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      COALESCE(NULLIF(btrim(oi.label), ''),
        CASE
          WHEN ri.type = 'deposit' AND ri.installment_id = md5(o.id::text || ':deposit:1')::uuid THEN 'Fattura acconto 2'
          WHEN ri.type = 'deposit' THEN 'Fattura acconto'
          WHEN ri.type = 'balance' THEN 'Fattura saldo'
          ELSE 'Fattura finanziamento'
        END) AS label,
      ri.type,
      CASE
        WHEN ri.type = 'deposit' AND oi.id IS NOT NULL AND lower(oi.label) LIKE '%2%' THEN 'acconto_2'
        WHEN ri.type = 'deposit' AND ri.installment_id = md5(o.id::text || ':deposit:1')::uuid THEN 'acconto_2'
        WHEN ri.type = 'deposit' THEN 'acconto'
        WHEN ri.type = 'balance' THEN 'saldo'
        WHEN ri.type = 'financing' THEN 'finanziamento'
        ELSE ri.type
      END AS rata_type_for_create_invoice_draft,
      ri.importo AS amount,
      COALESCE(d.residuo, 0) AS residuo,
      ri.expected_date,
      ri.is_paid,
      CASE WHEN oi.id IS NOT NULL THEN 'installment_esistente' ELSE 'campo_ordine' END AS source,
      oi.id IS NULL AS can_create_invoice_draft
    FROM ri
    JOIN public.orders o ON o.id = ri.order_id
    LEFT JOIN public.order_installments oi ON oi.id = ri.installment_id
    LEFT JOIN d ON d.installment_id = ri.installment_id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE COALESCE(ri.importo, 0) > 0
      AND (NOT p_only_unpaid OR (NOT ri.is_paid AND COALESCE(d.residuo, 0) > 0))
  ),
  limited AS (
    SELECT *
    FROM all_rows
    ORDER BY expected_date NULLS LAST, order_code, label
    LIMIT v_limit
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(residuo), 0),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'installment_id', installment_id,
        'order_id', order_id,
        'order_code', order_code,
        'customer_id', customer_id,
        'cliente', cliente,
        'label', label,
        'type', type,
        'rata_type_for_create_invoice_draft', rata_type_for_create_invoice_draft,
        'amount_eur', round(COALESCE(amount, 0)::numeric, 2),
        'da_incassare_eur', round(COALESCE(residuo, 0)::numeric, 2),
        'expected_date', expected_date,
        'is_paid', is_paid,
        'source', source,
        'can_create_invoice_draft', can_create_invoice_draft
      )
    ), '[]'::jsonb)
  INTO v_count, v_total, v_residuo, v_rows
  FROM limited;

  RETURN jsonb_build_object(
    'count', COALESCE(v_count, 0),
    'total_amount_eur', round(COALESCE(v_total, 0)::numeric, 2),
    'da_incassare_eur', round(COALESCE(v_residuo, 0)::numeric, 2),
    'nota_operativa', 'Importi IVA inclusa, con la regola della scheda commessa (il saldo è il residuo). can_create_invoice_draft=true indica una rata non ancora presente in order_installments: usa create_invoice_draft solo su quelle e dopo conferma utente.',
    'fatture_restanti', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$function$;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.silvio_payment_delay_pattern(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delays jsonb;
  v_avg_delay_days int;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- Per ogni cliente, il ritardo medio (data d'incasso - data attesa) delle rate incassate, con la
  -- regola della scheda commessa: piano rate e piano storico. La rata della finanziaria segue i tempi
  -- dell'istituto, non del cliente.
  WITH paid_rates AS (
    SELECT COALESCE(o.client_name, o.client_company) AS cliente,
           (r.paid_date - r.expected_date) AS delay_days
      FROM public.rate_importi(p_company_id) r
      JOIN public.orders o ON o.id = r.order_id
     WHERE r.is_paid AND r.paid_date IS NOT NULL AND r.expected_date IS NOT NULL
       AND r.importo > 0 AND r.type <> 'financing'
  )
  SELECT (SELECT jsonb_object_agg(x.cliente, x.avg_delay)
            FROM (SELECT cliente, ROUND(AVG(delay_days))::int AS avg_delay
                    FROM paid_rates
                   WHERE cliente IS NOT NULL
                   GROUP BY cliente
                  HAVING COUNT(*) >= 2) x),  -- almeno 2 pagamenti per cliente
         (SELECT COALESCE(ROUND(AVG(delay_days))::int, 0) FROM paid_rates)
    INTO v_delays, v_avg_delay_days;

  RETURN jsonb_build_object(
    'avg_delay_days_global', v_avg_delay_days,
    'delays_per_client', COALESCE(v_delays, '{}'::jsonb)
  );
END;
$function$;

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
-- Avvisi delle rate scadute: uno per commessa e tipo (acconto o saldo), col residuo vero.
select pg_temp.tra('public.silvio_detect_alerts(uuid)',
  $v$  -- Acconto scaduto$v$,
  $v$    AND COALESCE(o.balance_amount, 0) > 0;$v$,
  $n$  -- Rate scadute con la regola della scheda commessa: residuo vero, niente cestino, niente rata
  -- della finanziaria. Un avviso per commessa e tipo (acconto o saldo), dalla rata più vecchia.
  PERFORM public.silvio_create_alert(
    p_company_id, 'payment_overdue',
    CASE WHEN (CURRENT_DATE - s.prima) > 30 THEN 'critical' ELSE 'warning' END,
    format('%s in ritardo: %s', s.nome, s.cliente),
    format('%s di € %s su %s è scaduto da %s giorni (atteso il %s).',
           CASE s.chiave WHEN 'saldo' THEN 'Il saldo' ELSE 'L''acconto' END,
           to_char(s.importo, 'FM999G999D90'),
           s.order_code,
           CURRENT_DATE - s.prima,
           to_char(s.prima, 'DD/MM/YYYY')),
    format('overdue_%s:%s', s.chiave, s.order_id),
    NULL,
    'Manda sollecito',
    'send_overdue_reminder',
    jsonb_build_object('order_id', s.order_id, 'rata_type', s.chiave, 'amount', s.importo,
                       'client_email', s.client_email, 'client_name', s.client_name),
    'order', s.order_id,
    jsonb_build_object('giorni_ritardo', CURRENT_DATE - s.prima, 'importo', s.importo),
    NULL
  )
  FROM (
    SELECT r.order_id, r.order_code, r.cliente, r.client_email, o.client_name,
           CASE WHEN r.tipo = 'balance' THEN 'saldo' ELSE 'acconto' END AS chiave,
           CASE WHEN r.tipo = 'balance' THEN 'Saldo' ELSE 'Acconto' END AS nome,
           round(SUM(r.residuo), 2) AS importo, MIN(r.expected_date) AS prima
      FROM public.rate_da_incassare_dettaglio(p_company_id) r
      JOIN public.orders o ON o.id = r.order_id
     WHERE r.expected_date < CURRENT_DATE AND r.residuo > 0 AND NOT r.finanziamento
     GROUP BY 1, 2, 3, 4, 5, 6, 7
  ) s;$n$);
select pg_temp.tra('public.silvio_detect_alerts(uuid)',
  $v$  -- Risolvi overdue se pagato$v$,
  $v$        AND COALESCE(balance_paid, false) = true AND COALESCE(deposit_paid, false) = true
    );$v$,
  $n$  -- Risolvi le rate scadute che non lo sono più (incassate, spostate o commessa nel cestino)
  UPDATE public.silvio_alerts SET status = 'resolved', resolved_at = now()
  WHERE company_id = p_company_id AND status = 'open' AND alert_type = 'payment_overdue'
    AND source_type = 'order'
    AND dedup_key NOT IN (
      SELECT format('overdue_%s:%s', CASE WHEN r.tipo = 'balance' THEN 'saldo' ELSE 'acconto' END, r.order_id)
        FROM public.rate_da_incassare_dettaglio(p_company_id) r
       WHERE r.expected_date < CURRENT_DATE AND r.residuo > 0 AND NOT r.finanziamento
    );$n$);

-- Controlli anomalie: commesse nel cestino escluse; i crediti molto vecchi dalla regola.
select pg_temp.tra('public.silvio_detect_frodi_anomalie(uuid)',
  $v$    FROM public.orders
    WHERE company_id = p_company_id
      AND created_at > now() - interval '90 days'$v$,
  $v$      AND created_at > now() - interval '90 days'$v$,
  $n$    FROM public.orders
    WHERE company_id = p_company_id AND deleted_at IS NULL
      AND created_at > now() - interval '90 days'$n$);
select pg_temp.tra('public.silvio_detect_frodi_anomalie(uuid)',
  $v$        WHERE company_id = p_company_id
          AND total_amount > 0
      )$v$,
  $v$          AND total_amount > 0
      )$v$,
  $n$        WHERE company_id = p_company_id AND deleted_at IS NULL
          AND total_amount > 0
      )$n$);
select pg_temp.tra('public.silvio_detect_frodi_anomalie(uuid)',
  $v$      'order_id', id,
      'cliente', COALESCE(client_company, client_name),
      'importo_scaduto_eur', balance_amount,$v$,
  $v$      AND COALESCE(balance_amount, 0) > 0
    LIMIT 5$v$,
  $n$      'order_id', x.order_id,
      'order_code', x.order_code,
      'cliente', x.cliente,
      'importo_scaduto_eur', x.importo,
      'gg_ritardo', x.gg,
      'descrizione', 'Rate scadute da oltre 180 giorni'
    ))
    FROM (
      SELECT r.order_id, r.order_code, r.cliente, round(SUM(r.residuo), 2) AS importo,
             (CURRENT_DATE - MIN(r.expected_date)) AS gg
        FROM public.rate_da_incassare_dettaglio(p_company_id) r
       WHERE r.expected_date < CURRENT_DATE - 180 AND r.residuo > 0 AND NOT r.finanziamento
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC
       LIMIT 5
    ) x$n$);

-- Riepilogo del mattino: le rate scadute col residuo vero, senza la rata della finanziaria.
select pg_temp.tra('public.riepilogo_mattino(uuid,integer)',
  $v$               'riferimento', coalesce(r.label, 'rata'),$v$,
  $v$         AND r.expected_date IS NOT NULL AND r.expected_date < CURRENT_DATE$v$,
  $n$               'riferimento', r.label,
               'cliente', r.cliente,
               'importo', round(r.residuo, 2),
               'scadenza', r.expected_date,
               'scaduta_da', (CURRENT_DATE - r.expected_date),
               'azione', 'Verifica l''incasso della rata',
               'dove', '/azienda/commesse/' || r.order_id::text)
        FROM public.rate_da_incassare_dettaglio(p_company_id) r
       WHERE r.residuo > 0 AND NOT r.finanziamento
         AND r.expected_date IS NOT NULL AND r.expected_date < CURRENT_DATE$n$);

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
-- Provvigione sull'incassato: incassi della regola (movimenti sulle fatture delle rate, rate segnate
-- incassate); la rata della finanziaria resta fuori, come prima.
select pg_temp.tra('public.calculate_order_salesperson_commission(uuid,uuid,text,numeric)',
  $v$    SELECT
      COUNT(*),$v$,
  $v$THEN COALESCE(v_order.balance_amount, 0) ELSE 0 END;
    END IF;$v$,
  $n$    -- Incassato con la regola della scheda commessa; la rata della finanziaria resta fuori.
    SELECT COALESCE(SUM(x.importo), 0) INTO v_collected_gross
      FROM public.rate_incassi(v_order.company_id) x
      LEFT JOIN public.rate_importi(v_order.company_id) ri ON ri.installment_id = x.installment_id
     WHERE x.order_id = p_order_id AND COALESCE(ri.type, '') <> 'financing';$n$);
