-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-15 — AI Cashflow Forecast 90gg (predictive)
-- ════════════════════════════════════════════════════════════════════════════
-- Forecast cassa per 13 settimane (~90 giorni) basato su:
--   1. Saldo bancario attuale
--   2. Incassi previsti: rate non pagate con DELAY MEDIO STORICO applicato
--   3. Uscite previste: busta paga operai (43.500 lordo Demo), F24/IVA, fatture passive
--   4. Pattern detection: se cliente paga sempre 15gg in ritardo, lo prevediamo
--
-- Output: array settimanale {settimana, in, out, saldo_finale, status: ok/warning/critical}
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) RPC: silvio_payment_delay_pattern — calcola delay medio per cliente
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_payment_delay_pattern(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delays jsonb;
  v_avg_delay_days int;
BEGIN
  -- Per ogni cliente, calcola delay medio (data_pagamento - data_attesa)
  -- per le rate effettivamente pagate.
  WITH paid_rates AS (
    -- Acconti pagati
    SELECT COALESCE(client_name, client_company) AS cliente,
           (deposit_paid_date::date - deposit_expected_date) AS delay_days
    FROM public.orders
    WHERE company_id = p_company_id
      AND COALESCE(deposit_paid, false) = true
      AND deposit_paid_date IS NOT NULL AND deposit_expected_date IS NOT NULL
      AND COALESCE(deposit_amount, 0) > 0
    UNION ALL
    -- Saldi pagati
    SELECT COALESCE(client_name, client_company),
           (balance_paid_date::date - balance_expected_date)
    FROM public.orders
    WHERE company_id = p_company_id
      AND COALESCE(balance_paid, false) = true
      AND balance_paid_date IS NOT NULL AND balance_expected_date IS NOT NULL
      AND COALESCE(balance_amount, 0) > 0
  )
  SELECT jsonb_object_agg(cliente, avg_delay) INTO v_delays
  FROM (
    SELECT cliente, ROUND(AVG(delay_days))::int AS avg_delay
    FROM paid_rates
    WHERE cliente IS NOT NULL
    GROUP BY cliente
    HAVING COUNT(*) >= 2  -- almeno 2 pagamenti per significatività
  ) x;

  -- Delay medio globale (fallback per nuovi clienti)
  SELECT COALESCE(ROUND(AVG(delay_days))::int, 0) INTO v_avg_delay_days
  FROM (
    SELECT (deposit_paid_date::date - deposit_expected_date) AS delay_days
    FROM public.orders WHERE company_id = p_company_id
      AND COALESCE(deposit_paid, false) = true
      AND deposit_paid_date IS NOT NULL AND deposit_expected_date IS NOT NULL
    UNION ALL
    SELECT (balance_paid_date::date - balance_expected_date)
    FROM public.orders WHERE company_id = p_company_id
      AND COALESCE(balance_paid, false) = true
      AND balance_paid_date IS NOT NULL AND balance_expected_date IS NOT NULL
  ) x;

  RETURN jsonb_build_object(
    'avg_delay_days_global', v_avg_delay_days,
    'delays_per_client', COALESCE(v_delays, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_payment_delay_pattern(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_payment_delay_pattern(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: silvio_cashflow_forecast_90d — forecast settimanale
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_cashflow_forecast_90d(
  p_company_id uuid,
  p_weeks int DEFAULT 13,
  p_apply_delay boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Incassi previsti questa settimana (rate non pagate con delay applicato)
    WITH expected_in AS (
      -- Acconto
      SELECT COALESCE(deposit_amount, 0) AS amount,
             deposit_expected_date AS expected_date,
             COALESCE(client_name, client_company, '') AS cliente
      FROM public.orders
      WHERE company_id = p_company_id
        AND COALESCE(deposit_paid, false) = false
        AND deposit_expected_date IS NOT NULL
        AND COALESCE(deposit_amount, 0) > 0
      UNION ALL
      -- Acconto 2
      SELECT COALESCE(deposit_2_amount, 0),
             deposit_2_expected_date,
             COALESCE(client_name, client_company, '')
      FROM public.orders
      WHERE company_id = p_company_id
        AND COALESCE(deposit_2_paid, false) = false
        AND deposit_2_expected_date IS NOT NULL
        AND COALESCE(deposit_2_amount, 0) > 0
      UNION ALL
      -- Saldo
      SELECT COALESCE(balance_amount, 0),
             balance_expected_date,
             COALESCE(client_name, client_company, '')
      FROM public.orders
      WHERE company_id = p_company_id
        AND COALESCE(balance_paid, false) = false
        AND balance_expected_date IS NOT NULL
        AND COALESCE(balance_amount, 0) > 0
      UNION ALL
      -- Finanziamento
      SELECT COALESCE(financing_amount, 0),
             financing_expected_date,
             COALESCE(client_name, client_company, '')
      FROM public.orders
      WHERE company_id = p_company_id
        AND COALESCE(financing_paid, false) = false
        AND financing_expected_date IS NOT NULL
        AND COALESCE(financing_amount, 0) > 0
    )
    SELECT COALESCE(SUM(amount), 0) INTO v_week_in
    FROM expected_in
    WHERE
      -- Applica delay storico per cliente, se presente
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

    -- Status: critical se <0, warning se < 10% liquidità iniziale
    DECLARE v_status text;
    BEGIN
      v_status := CASE
        WHEN v_running < 0 THEN 'critical'
        WHEN v_running < (v_balance_today * 0.10) THEN 'warning'
        ELSE 'ok'
      END;
    END;

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
$$;

REVOKE ALL ON FUNCTION public.silvio_cashflow_forecast_90d(uuid, int, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_cashflow_forecast_90d(uuid, int, boolean) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Detect alert: cassa critica nei prossimi 90gg
--    Estende silvio_detect_alerts (chiamata aggiuntiva)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_detect_cashflow_alerts(p_company_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forecast jsonb;
  v_critical_count int;
  v_min_week date;
  v_min_balance numeric;
  v_alerts_created int := 0;
BEGIN
  v_forecast := public.silvio_cashflow_forecast_90d(p_company_id, 13, true);
  v_critical_count := (v_forecast->>'critical_weeks_count')::int;
  v_min_week := (v_forecast->>'settimana_critica')::date;
  v_min_balance := (v_forecast->>'saldo_minimo_eur')::numeric;

  IF v_critical_count > 0 THEN
    PERFORM public.silvio_create_alert(
      p_company_id,
      'cashflow_critical_forecast',
      'critical',
      format('Cassa critica prevista: settimana del %s', to_char(v_min_week, 'DD/MM/YYYY')),
      format('Il forecast 90gg prevede %s settimane in negativo. Saldo minimo previsto: € %s nella settimana del %s. Anticipa incassi e rinvia uscite non urgenti.',
             v_critical_count,
             to_char(v_min_balance, 'FM999G999D90'),
             to_char(v_min_week, 'DD/MM/YYYY')),
      'cashflow_forecast_critical',
      NULL,
      'Vedi dettaglio forecast',
      'open_cashflow_forecast',
      jsonb_build_object('week_start', v_min_week, 'min_balance', v_min_balance),
      'cashflow_forecast', NULL,
      jsonb_build_object('critical_weeks', v_critical_count, 'min_balance', v_min_balance),
      now() + interval '7 days'
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  RETURN v_alerts_created;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_detect_cashflow_alerts(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_detect_cashflow_alerts(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Estendi silvio_detect_alerts per chiamare anche cashflow detect
-- ───────────────────────────────────────────────────────────────────────────

-- Aggancia all'esistente silvio_detect_alerts (alla fine)
-- Approccio: creo un wrapper che chiama entrambi
-- Già abbiamo silvio_detect_alerts; aggiungo solo cashflow alla cron pipeline
-- via silvio_detect_alerts_all_companies (chiamato dal cron 30min).

CREATE OR REPLACE FUNCTION public.silvio_detect_alerts_all_companies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_total int := 0;
  v_failed int := 0;
  v_cashflow_alerts int := 0;
BEGIN
  FOR v_company_id IN
    SELECT id FROM public.companies
    WHERE COALESCE(is_archived, false) = false
  LOOP
    BEGIN
      PERFORM public.silvio_detect_alerts(v_company_id);
      v_cashflow_alerts := v_cashflow_alerts + COALESCE(public.silvio_detect_cashflow_alerts(v_company_id), 0);
      v_total := v_total + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING '[silvio detect cron] company % failed: %', v_company_id, SQLERRM;
    END;
  END LOOP;

  PERFORM public.silvio_expire_alerts();

  RETURN jsonb_build_object(
    'success', true, 'companies_processed', v_total,
    'failures', v_failed, 'cashflow_alerts_created', v_cashflow_alerts
  );
END;
$$;
