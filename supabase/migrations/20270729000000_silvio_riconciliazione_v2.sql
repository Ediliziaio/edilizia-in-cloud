-- RICONCILIAZIONE FINANZIARIA SILVIO — round 2 (audit completo tool restanti).
-- Altri 3 punti con la stessa malattia (union legacy a 4 rami che ignora
-- order_installments e conta importi superati dal piano rate):
--   1. silvio_cashflow_forecast_90d: incassi attesi settimanali SOLO da
--      colonne legacy → per le commesse col piano rate perdeva le rate non
--      pagate E contava i vecchi importi legacy non più validi.
--   2. silvio_tool_revenue_needed_next_month: stesso union legacy nella CTE
--      receivables → rate scadute/previste sbagliate nel prospetto
--      "quanto devo fatturare".
--   3. silvio_tool_company_kpi.commesse_attive: usava il flag legacy
--      balance_paid → per le commesse col piano rate il flag è morto.
-- Tutti e tre ora leggono v_rate_commesse_unificate (rate DB > legacy,
-- mai entrambe per la stessa commessa).
-- Verificati sani: silvio_tool_detect_duplicate_payments,
-- silvio_tool_quotes_summary (solo-preventivi by design; la pipeline
-- completa è get_pipeline_forecast).

-- ─── 1) cashflow_forecast_90d ────────────────────────────────────────────────
create or replace function public.silvio_cashflow_forecast_90d(p_company_id uuid, p_weeks integer default 13, p_apply_delay boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_balance_today numeric := 0;
  v_pattern jsonb;
  v_avg_delay int;
  v_weeks_data jsonb := '[]'::jsonb;
  v_week_start date;
  v_week_end date;
  v_week_in numeric;
  v_week_out numeric;
  v_running numeric;
  v_critical_weeks int := 0;
  v_warning_weeks int := 0;
  v_min_balance numeric;
  v_min_week_start date;
  v_total_in_90d numeric := 0;
  v_total_out_90d numeric := 0;
  v_monthly_payroll numeric := 0;
BEGIN
  -- 1) Saldo banca oggi
  BEGIN
    SELECT COALESCE(SUM(current_balance), 0) INTO v_balance_today
    FROM public.bank_accounts
    WHERE company_id = p_company_id
      AND COALESCE(is_archived, false) = false;
  EXCEPTION WHEN OTHERS THEN v_balance_today := 0; END;

  -- 2) Pattern delay
  v_pattern := public.silvio_payment_delay_pattern(p_company_id);
  v_avg_delay := COALESCE((v_pattern->>'avg_delay_days_global')::int, 0);

  -- 3) Costo personale mensile (per spalmare uscite previste)
  BEGIN
    SELECT COALESCE(SUM(net_salary), 0) INTO v_monthly_payroll
    FROM public.employees
    WHERE company_id = p_company_id AND COALESCE(is_active, true) = true;
  EXCEPTION WHEN OTHERS THEN v_monthly_payroll := 0; END;

  -- 4) Inizializza running balance
  v_running := v_balance_today;
  v_min_balance := v_balance_today;
  v_min_week_start := CURRENT_DATE;

  -- 5) Loop settimanale
  FOR i IN 0..(p_weeks - 1) LOOP
    v_week_start := CURRENT_DATE + (i * 7);
    v_week_end := v_week_start + 6;

    -- Incassi previsti questa settimana: rate non pagate dalla VISTA
    -- UNIFICATA (rate DB > colonne legacy, mai entrambe), delay applicato.
    WITH expected_in AS (
      SELECT r.amount AS amount,
             r.expected_date AS expected_date,
             COALESCE(o.client_name, o.client_company, '') AS cliente
      FROM public.v_rate_commesse_unificate r
      JOIN public.orders o ON o.id = r.order_id
      WHERE r.company_id = p_company_id
        AND NOT r.is_paid
        AND r.expected_date IS NOT NULL
        AND r.amount > 0
    )
    SELECT COALESCE(SUM(amount), 0) INTO v_week_in
    FROM expected_in
    WHERE
      CASE
        WHEN p_apply_delay AND v_pattern->'delays_per_client' ? cliente
          THEN expected_date + ((v_pattern->'delays_per_client'->>cliente)::int)
        WHEN p_apply_delay
          THEN expected_date + v_avg_delay
        ELSE expected_date
      END BETWEEN v_week_start AND v_week_end;

    -- Uscite previste settimana
    -- (a) Fatture passive con scadenza in questa settimana
    BEGIN
      SELECT COALESCE(SUM(totale_documento), 0) INTO v_week_out
      FROM public.fatture_ricevute
      WHERE company_id = p_company_id
        AND data_fattura + interval '60 days' BETWEEN v_week_start AND v_week_end -- assume pagamento a 60gg
        AND COALESCE(totale_documento, 0) > 0;
    EXCEPTION WHEN OTHERS THEN v_week_out := 0; END;

    -- (b) Busta paga: spalma il netto mensile su 4.33 settimane (=mese)
    v_week_out := v_week_out + (v_monthly_payroll / 4.33);

    -- Update running
    v_running := v_running + v_week_in - v_week_out;
    v_total_in_90d := v_total_in_90d + v_week_in;
    v_total_out_90d := v_total_out_90d + v_week_out;

    IF v_running < v_min_balance THEN
      v_min_balance := v_running;
      v_min_week_start := v_week_start;
    END IF;

    IF v_running < 0 THEN v_critical_weeks := v_critical_weeks + 1; END IF;
    IF v_running >= 0 AND v_running < (v_balance_today * 0.10) THEN
      v_warning_weeks := v_warning_weeks + 1;
    END IF;

    v_weeks_data := v_weeks_data || jsonb_build_object(
      'week_index', i + 1,
      'week_start', v_week_start,
      'week_end', v_week_end,
      'incassi_eur', round(v_week_in::numeric, 2),
      'uscite_eur', round(v_week_out::numeric, 2),
      'cashflow_netto_eur', round((v_week_in - v_week_out)::numeric, 2),
      'saldo_atteso_eur', round(v_running::numeric, 2),
      'status', CASE
        WHEN v_running < 0 THEN 'critical'
        WHEN v_running < (v_balance_today * 0.10) THEN 'warning'
        ELSE 'ok'
      END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'aggiornato_al', now(),
    'saldo_oggi_eur', round(v_balance_today::numeric, 2),
    'orizzonte_settimane', p_weeks,
    'delay_pattern', v_pattern,
    'costo_personale_mensile_netto_eur', round(v_monthly_payroll::numeric, 2),
    'totale_incassi_previsti_eur', round(v_total_in_90d::numeric, 2),
    'totale_uscite_previste_eur', round(v_total_out_90d::numeric, 2),
    'saldo_atteso_fine_periodo_eur', round(v_running::numeric, 2),
    'saldo_minimo_eur', round(v_min_balance::numeric, 2),
    'settimana_critica', v_min_week_start,
    'critical_weeks_count', v_critical_weeks,
    'warning_weeks_count', v_warning_weeks,
    'weeks', v_weeks_data
  );
END;
$function$;

-- ─── 2) revenue_needed_next_month: receivables dalla vista unificata ────────
create or replace function public.silvio_tool_revenue_needed_next_month(p_company_id uuid, p_target_month date default null, p_margin_pct numeric default 0.30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_month_start date := DATE_TRUNC('month', COALESCE(p_target_month, CURRENT_DATE + INTERVAL '1 month'))::date;
  v_month_end date := (DATE_TRUNC('month', COALESCE(p_target_month, CURRENT_DATE + INTERVAL '1 month')) + INTERVAL '1 month - 1 day')::date;
  v_margin numeric := LEAST(GREATEST(COALESCE(p_margin_pct, 0.30), 0.05), 0.95);
  v_payroll_gross numeric := 0;
  v_payroll_net numeric := 0;
  v_open_costs_month numeric := 0;
  v_overdue_costs numeric := 0;
  v_open_costs_no_date numeric := 0;
  v_future_receivables numeric := 0;
  v_overdue_receivables numeric := 0;
  v_total_to_cover numeric := 0;
  v_available_receivables numeric := 0;
  v_cash_gap numeric := 0;
  v_revenue_target_by_margin numeric := 0;
  v_variable_cost_total_pct numeric := 0;
  v_upfront_variable_pct numeric := 0;
  v_standard_deposit_pct numeric := 0.50;
  v_protected_deposit_pct numeric := 0.70;
  v_standard_net_cash_pct numeric := 0;
  v_protected_net_cash_pct numeric := 0;
  v_standard_revenue_to_sign numeric := NULL;
  v_protected_revenue_to_sign numeric := NULL;
  v_recovery_required numeric := 0;
  v_mixed_recovery_amount numeric := 0;
  v_mixed_gap_after_recovery numeric := 0;
  v_mixed_new_revenue_protected numeric := 0;
  v_orders_count int := 0;
  v_active_employees_count int := 0;
  v_open_costs_count int := 0;
  v_receivable_rows_count int := 0;
  v_data_warnings text[] := ARRAY[]::text[];
  v_cost_details jsonb := '[]'::jsonb;
  v_overdue_clients jsonb := '[]'::jsonb;
  v_future_clients jsonb := '[]'::jsonb;
BEGIN
  SELECT COUNT(*)
  INTO v_orders_count
  FROM public.orders
  WHERE company_id = p_company_id;

  SELECT COUNT(*)
  INTO v_active_employees_count
  FROM public.employees
  WHERE company_id = p_company_id
    AND COALESCE(is_active, true) = true;

  SELECT
    COALESCE(SUM(gross_salary), 0),
    COALESCE(SUM(net_salary), 0)
  INTO v_payroll_gross, v_payroll_net
  FROM public.employees
  WHERE company_id = p_company_id
    AND COALESCE(is_active, true) = true;

  SELECT COUNT(*)
  INTO v_open_costs_count
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_open_costs_month
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND due_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_overdue_costs
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND due_date < CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_open_costs_no_date
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND due_date IS NULL;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'nome', name,
        'categoria', category,
        'tipo', cost_type,
        'importo_eur', ROUND(amount::numeric, 2),
        'scadenza', due_date,
        'stato', CASE
          WHEN due_date < CURRENT_DATE THEN 'scaduto'
          WHEN due_date BETWEEN v_month_start AND v_month_end THEN 'mese_target'
          WHEN due_date IS NULL THEN 'senza_data'
          ELSE 'fuori_periodo'
        END
      )
      ORDER BY due_date NULLS LAST, amount DESC
    ),
    '[]'::jsonb
  )
  INTO v_cost_details
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND (due_date < CURRENT_DATE OR due_date BETWEEN v_month_start AND v_month_end OR due_date IS NULL);

  -- Rate clienti dalla VISTA UNIFICATA (rate DB > colonne legacy, mai doppie)
  WITH receivables AS (
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato') AS cliente,
      lower(r.label) AS tipo,
      r.amount AS importo_eur,
      r.expected_date AS data_attesa
    FROM public.v_rate_commesse_unificate r
    JOIN public.orders o ON o.id = r.order_id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE r.company_id = p_company_id
      AND NOT r.is_paid
      AND r.expected_date IS NOT NULL
      AND r.amount > 0
  )
  SELECT
    COALESCE(SUM(importo_eur) FILTER (WHERE data_attesa < CURRENT_DATE), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE data_attesa BETWEEN v_month_start AND v_month_end), 0),
    COALESCE(COUNT(*) FILTER (WHERE importo_eur > 0), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa,
          'giorni_ritardo', CURRENT_DATE - data_attesa
        )
        ORDER BY data_attesa ASC, importo_eur DESC
      ) FILTER (WHERE data_attesa < CURRENT_DATE),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa
        )
        ORDER BY data_attesa ASC, importo_eur DESC
      ) FILTER (WHERE data_attesa BETWEEN v_month_start AND v_month_end),
      '[]'::jsonb
    )
  INTO v_overdue_receivables, v_future_receivables, v_receivable_rows_count, v_overdue_clients, v_future_clients
  FROM receivables;

  v_total_to_cover := v_payroll_gross + v_open_costs_month + v_overdue_costs;
  v_available_receivables := v_overdue_receivables + v_future_receivables;
  v_cash_gap := GREATEST(v_total_to_cover - v_available_receivables, 0);
  v_revenue_target_by_margin := CASE WHEN v_cash_gap = 0 THEN 0 ELSE v_cash_gap / v_margin END;

  v_variable_cost_total_pct := GREATEST(0, 1 - v_margin);
  v_upfront_variable_pct := LEAST(GREATEST(v_variable_cost_total_pct * 0.50, 0.15), 0.70);
  v_protected_deposit_pct := LEAST(GREATEST(v_upfront_variable_pct + 0.20, 0.70), 0.90);
  v_standard_net_cash_pct := v_standard_deposit_pct - v_upfront_variable_pct;
  v_protected_net_cash_pct := v_protected_deposit_pct - v_upfront_variable_pct;
  v_standard_revenue_to_sign := CASE
    WHEN v_cash_gap = 0 THEN 0
    WHEN v_standard_net_cash_pct > 0 THEN v_cash_gap / v_standard_net_cash_pct
    ELSE NULL
  END;
  v_protected_revenue_to_sign := CASE
    WHEN v_cash_gap = 0 THEN 0
    WHEN v_protected_net_cash_pct > 0 THEN v_cash_gap / v_protected_net_cash_pct
    ELSE NULL
  END;
  v_recovery_required := LEAST(v_cash_gap, v_overdue_receivables);
  v_mixed_recovery_amount := LEAST(v_cash_gap, v_overdue_receivables * 0.50);
  v_mixed_gap_after_recovery := GREATEST(v_cash_gap - v_mixed_recovery_amount, 0);
  v_mixed_new_revenue_protected := CASE
    WHEN v_mixed_gap_after_recovery = 0 THEN 0
    WHEN v_protected_net_cash_pct > 0 THEN v_mixed_gap_after_recovery / v_protected_net_cash_pct
    ELSE NULL
  END;

  IF v_orders_count = 0 THEN
    v_data_warnings := array_append(v_data_warnings, 'orders_missing');
  END IF;
  IF v_active_employees_count = 0 THEN
    v_data_warnings := array_append(v_data_warnings, 'active_employees_missing');
  END IF;
  IF v_open_costs_count = 0 THEN
    v_data_warnings := array_append(v_data_warnings, 'fixed_costs_missing');
  END IF;
  IF v_receivable_rows_count = 0 THEN
    v_data_warnings := array_append(v_data_warnings, 'receivables_missing');
  END IF;
  IF v_total_to_cover = 0 AND (v_active_employees_count = 0 OR v_open_costs_count = 0) THEN
    v_data_warnings := array_append(v_data_warnings, 'cash_need_not_certifiable_without_cost_setup');
  END IF;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('mese', TO_CHAR(v_month_start, 'YYYY-MM'), 'dal', v_month_start, 'al', v_month_end),
    'data_quality', jsonb_build_object(
      'orders_count', v_orders_count,
      'active_employees_count', v_active_employees_count,
      'open_costs_count', v_open_costs_count,
      'receivable_rows_count', v_receivable_rows_count,
      'warnings', to_jsonb(v_data_warnings),
      'lettura', CASE
        WHEN array_length(v_data_warnings, 1) IS NULL THEN 'Dati sufficienti per una lettura operativa del fabbisogno cassa.'
        ELSE 'Dati parziali: non trasformare valori zero in certezza. Spiega quali dati mancano prima di dare il target.'
      END
    ),
    'principio_guida', 'Fatturato non significa incasso: una vendita nuova aiuta la cassa solo se l''acconto entra nel periodo e copre almeno i costi variabili iniziali di materiali, posa e fornitori.',
    'ipotesi', jsonb_build_object(
      'margine_su_nuovo_fatturato_pct', ROUND((v_margin * 100)::numeric, 1),
      'costi_variabili_totali_stimati_pct', ROUND((v_variable_cost_total_pct * 100)::numeric, 1),
      'costi_variabili_da_anticipare_stimati_pct', ROUND((v_upfront_variable_pct * 100)::numeric, 1),
      'acconto_standard_pct', ROUND((v_standard_deposit_pct * 100)::numeric, 1),
      'acconto_protetto_suggerito_pct', ROUND((v_protected_deposit_pct * 100)::numeric, 1),
      'nota', 'Le percentuali sono ipotesi prudenziali se non esistono margini/tempi di incasso certificati per le nuove commesse.'
    ),
    'costi_da_coprire', jsonb_build_object(
      'personale_lordo_eur', ROUND(v_payroll_gross::numeric, 2),
      'personale_netto_eur', ROUND(v_payroll_net::numeric, 2),
      'costi_aperti_mese_target_eur', ROUND(v_open_costs_month::numeric, 2),
      'costi_aperti_scaduti_eur', ROUND(v_overdue_costs::numeric, 2),
      'costi_aperti_senza_data_eur', ROUND(v_open_costs_no_date::numeric, 2),
      'totale_da_coprire_eur', ROUND(v_total_to_cover::numeric, 2),
      'dettaglio_costi', v_cost_details
    ),
    'incassi_clienti', jsonb_build_object(
      'rate_scadute_recuperabili_eur', ROUND(v_overdue_receivables::numeric, 2),
      'incassi_previsti_mese_target_eur', ROUND(v_future_receivables::numeric, 2),
      'totale_utilizzabile_eur', ROUND(v_available_receivables::numeric, 2),
      'clienti_scaduti', v_overdue_clients,
      'clienti_previsti_mese', v_future_clients
    ),
    'risultato', jsonb_build_object(
      'gap_cassa_eur', ROUND(v_cash_gap::numeric, 2),
      'fatturato_minimo_teorico_a_margine_eur', ROUND(v_revenue_target_by_margin::numeric, 2),
      'fatturato_da_firmare_con_acconto_standard_eur', ROUND(v_standard_revenue_to_sign::numeric, 2),
      'fatturato_da_firmare_con_acconto_protetto_eur', ROUND(v_protected_revenue_to_sign::numeric, 2),
      'lettura', CASE
        WHEN v_cash_gap = 0 AND array_length(v_data_warnings, 1) IS NOT NULL THEN 'Il gap risulta zero solo sui dati presenti, ma il fabbisogno non e certificabile finche mancano costi/personale/incassi configurati.'
        WHEN v_cash_gap = 0 THEN 'Con i dati presenti, incassi previsti e recupero scaduti coprono i costi certificati del periodo.'
        ELSE 'Il numero di fatturato va letto come scenario, non come incasso: serve cassa vera o nuove commesse con acconti sufficienti a coprire i costi variabili iniziali.'
      END
    ),
    'scenari_operativi', jsonb_build_array(
      jsonb_build_object(
        'scenario', 'Recupero crediti scaduti',
        'incasso_da_ottenere_eur', ROUND(v_recovery_required::numeric, 2),
        'fatturato_nuovo_da_generare_eur', 0,
        'priorita', 1,
        'perche', 'Incassa cassa gia maturata e non genera nuovi costi variabili di materiali o posa.'
      ),
      jsonb_build_object(
        'scenario', 'Nuove commesse con acconto standard',
        'acconto_pct', ROUND((v_standard_deposit_pct * 100)::numeric, 1),
        'costi_variabili_da_anticipare_pct', ROUND((v_upfront_variable_pct * 100)::numeric, 1),
        'cassa_libera_per_100_eur_venduto', ROUND((v_standard_net_cash_pct * 100)::numeric, 2),
        'fatturato_da_firmare_eur', ROUND(v_standard_revenue_to_sign::numeric, 2),
        'fattibile', v_standard_net_cash_pct > 0,
        'perche', 'Funziona solo se l''acconto entra subito e resta cassa dopo gli anticipi a fornitori, posa e materiali.'
      ),
      jsonb_build_object(
        'scenario', 'Nuove commesse con acconto protetto',
        'acconto_pct', ROUND((v_protected_deposit_pct * 100)::numeric, 1),
        'costi_variabili_da_anticipare_pct', ROUND((v_upfront_variable_pct * 100)::numeric, 1),
        'cassa_libera_per_100_eur_venduto', ROUND((v_protected_net_cash_pct * 100)::numeric, 2),
        'fatturato_da_firmare_eur', ROUND(v_protected_revenue_to_sign::numeric, 2),
        'priorita', 2,
        'perche', 'Riduce il rischio di usare clienti nuovi per tappare buchi vecchi senza liquidita per eseguire la commessa.'
      ),
      jsonb_build_object(
        'scenario', 'Piano misto prudente',
        'recupero_crediti_ipotizzato_eur', ROUND(v_mixed_recovery_amount::numeric, 2),
        'gap_residuo_eur', ROUND(v_mixed_gap_after_recovery::numeric, 2),
        'fatturato_da_firmare_con_acconto_protetto_eur', ROUND(v_mixed_new_revenue_protected::numeric, 2),
        'priorita', 3,
        'perche', 'Combina sollecito crediti e nuovo venduto protetto, senza basarsi solo su fatturato non ancora incassato.'
      )
    ),
    'azioni_consigliate', jsonb_build_array(
      'Sollecitare subito i clienti scaduti fino a coprire almeno il gap di cassa certificato.',
      'Per nuove commesse, chiedere acconto protetto e non avviare lavori se l''acconto non copre materiali/posa/fornitori iniziali.',
      'Separare nel piano: ordini firmati, incassi attesi, costi variabili da pagare e cassa realmente libera.'
    )
  );
END;
$function$;

-- ─── 3) company_kpi.commesse_attive via vista (flag legacy balance_paid
--        morto per le commesse col piano rate) ───────────────────────────────
-- Attiva = ha almeno una rata non incassata OPPURE non ha alcun piano rate.
-- (Sostituisce solo il calcolo di v_orders_active; resto identico alla v1.)
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
    FROM public.orders o
   WHERE o.company_id = p_company_id
     AND (
       EXISTS (SELECT 1 FROM public.v_rate_commesse_unificate r WHERE r.order_id = o.id AND NOT r.is_paid)
       OR NOT EXISTS (SELECT 1 FROM public.v_rate_commesse_unificate r WHERE r.order_id = o.id)
     );

  SELECT count(*), COALESCE(sum(total_amount), 0) INTO v_orders_ytd, v_revenue_ytd
    FROM public.orders WHERE company_id = p_company_id
      AND created_at >= date_trunc('year', CURRENT_DATE);

  BEGIN
    SELECT count(*) INTO v_quotes_open
      FROM public.quotes WHERE company_id = p_company_id
        AND status IN ('draft', 'sent', 'pending', 'aperto', 'inviato');
  EXCEPTION WHEN OTHERS THEN v_quotes_open := NULL; END;

  SELECT count(*), COALESCE(sum(amount), 0) INTO v_overdue_count, v_overdue_amount
    FROM public.v_rate_commesse_unificate
   WHERE company_id = p_company_id AND NOT is_paid AND expected_date < CURRENT_DATE;

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
    'fatturato_anno_corrente_eur', round(v_revenue_ytd::numeric, 2),
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
