-- Fix Silvio finanziario:
-- - incassi futuri: esclude scaduti dal forecast "prossimi N giorni"
-- - crediti scaduti: risolve il nome cliente da profiles quando orders ha client_name vuoto
-- - fatturato target: calcolo deterministico per "quanto devo fatturare il mese prossimo"

-- ───────────────────────────────────────────────────────────────────────────
-- silvio_tool_revenue_forecast — incassi FUTURI nei prossimi N giorni
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_revenue_forecast(
  p_company_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until date := (CURRENT_DATE + (LEAST(GREATEST(COALESCE(p_days_ahead, 30), 1), 365) || ' days')::interval)::date;
  v_deposit_due numeric := 0;
  v_deposit2_due numeric := 0;
  v_balance_due numeric := 0;
  v_financing_due numeric := 0;
  v_total_due numeric := 0;
  v_overdue_excluded numeric := 0;
  v_breakdown jsonb := '[]'::jsonb;
BEGIN
  WITH due AS (
    SELECT
      o.order_code,
      COALESCE(
        NULLIF(TRIM(o.client_name), ''),
        NULLIF(TRIM(o.client_company), ''),
        NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
        p.email,
        'Cliente non indicato'
      ) AS cliente,
      'acconto' AS tipo,
      COALESCE(o.deposit_amount, 0) AS importo_eur,
      o.deposit_expected_date AS data_attesa
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_paid, false) = false
      AND o.deposit_expected_date BETWEEN CURRENT_DATE AND v_until
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'acconto_2',
      COALESCE(o.deposit_2_amount, 0),
      o.deposit_2_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_2_paid, false) = false
      AND o.deposit_2_expected_date BETWEEN CURRENT_DATE AND v_until
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'saldo',
      COALESCE(o.balance_amount, 0),
      o.balance_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.balance_paid, false) = false
      AND o.balance_expected_date BETWEEN CURRENT_DATE AND v_until
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'finanziamento',
      COALESCE(o.financing_amount, 0),
      o.financing_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.financing_paid, false) = false
      AND o.financing_expected_date BETWEEN CURRENT_DATE AND v_until
  )
  SELECT
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'acconto'), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'acconto_2'), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'saldo'), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'finanziamento'), 0),
    COALESCE(SUM(importo_eur), 0),
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
      ),
      '[]'::jsonb
    )
  INTO v_deposit_due, v_deposit2_due, v_balance_due, v_financing_due, v_total_due, v_breakdown
  FROM due;

  WITH overdue AS (
    SELECT COALESCE(o.deposit_amount, 0) AS importo_eur
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_paid, false) = false AND o.deposit_expected_date < CURRENT_DATE
    UNION ALL
    SELECT COALESCE(o.deposit_2_amount, 0)
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_2_paid, false) = false AND o.deposit_2_expected_date < CURRENT_DATE
    UNION ALL
    SELECT COALESCE(o.balance_amount, 0)
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.balance_paid, false) = false AND o.balance_expected_date < CURRENT_DATE
    UNION ALL
    SELECT COALESCE(o.financing_amount, 0)
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.financing_paid, false) = false AND o.financing_expected_date < CURRENT_DATE
  )
  SELECT COALESCE(SUM(importo_eur), 0) INTO v_overdue_excluded
  FROM overdue;

  RETURN jsonb_build_object(
    'orizzonte_giorni', LEAST(GREATEST(COALESCE(p_days_ahead, 30), 1), 365),
    'dal', CURRENT_DATE,
    'data_limite', v_until,
    'totale_da_incassare_eur', ROUND(v_total_due::numeric, 2),
    'scaduti_esclusi_eur', ROUND(v_overdue_excluded::numeric, 2),
    'nota', 'Il forecast include solo incassi futuri. I crediti gia scaduti sono esclusi e vanno letti con get_overdue_payments.',
    'breakdown', jsonb_build_object(
      'acconti_eur', ROUND(v_deposit_due::numeric, 2),
      'acconti_2_eur', ROUND(v_deposit2_due::numeric, 2),
      'saldi_eur', ROUND(v_balance_due::numeric, 2),
      'finanziamenti_eur', ROUND(v_financing_due::numeric, 2)
    ),
    'top_commesse', v_breakdown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_revenue_forecast(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_revenue_forecast(uuid, int) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- silvio_tool_overdue_payments — rate scadute non pagate con nome cliente
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_overdue_payments(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  v_count int := 0;
  v_overdue jsonb := '[]'::jsonb;
BEGIN
  WITH overdue AS (
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato') AS cliente,
      'acconto' AS tipo,
      COALESCE(o.deposit_amount, 0) AS importo_eur,
      o.deposit_expected_date AS data_attesa,
      (CURRENT_DATE - o.deposit_expected_date) AS giorni_ritardo
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_paid, false) = false
      AND o.deposit_expected_date IS NOT NULL
      AND o.deposit_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'acconto_2',
      COALESCE(o.deposit_2_amount, 0),
      o.deposit_2_expected_date,
      (CURRENT_DATE - o.deposit_2_expected_date)
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_2_paid, false) = false
      AND o.deposit_2_expected_date IS NOT NULL
      AND o.deposit_2_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'saldo',
      COALESCE(o.balance_amount, 0),
      o.balance_expected_date,
      (CURRENT_DATE - o.balance_expected_date)
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.balance_paid, false) = false
      AND o.balance_expected_date IS NOT NULL
      AND o.balance_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'finanziamento',
      COALESCE(o.financing_amount, 0),
      o.financing_expected_date,
      (CURRENT_DATE - o.financing_expected_date)
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.financing_paid, false) = false
      AND o.financing_expected_date IS NOT NULL
      AND o.financing_expected_date < CURRENT_DATE
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(importo_eur), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa,
          'giorni_ritardo', giorni_ritardo
        )
        ORDER BY giorni_ritardo DESC, importo_eur DESC
      ),
      '[]'::jsonb
    )
  INTO v_count, v_total, v_overdue
  FROM overdue;

  RETURN jsonb_build_object(
    'totale_scaduti', v_count,
    'importo_totale_eur', ROUND(v_total::numeric, 2),
    'rate_scadute', v_overdue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_overdue_payments(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_overdue_payments(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- silvio_tool_revenue_needed_next_month — fatturato target cassa
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_revenue_needed_next_month(
  p_company_id uuid,
  p_target_month date DEFAULT NULL,
  p_margin_pct numeric DEFAULT 0.30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_revenue_target numeric := 0;
  v_cost_details jsonb := '[]'::jsonb;
  v_overdue_clients jsonb := '[]'::jsonb;
  v_future_clients jsonb := '[]'::jsonb;
BEGIN
  SELECT
    COALESCE(SUM(gross_salary), 0),
    COALESCE(SUM(net_salary), 0)
  INTO v_payroll_gross, v_payroll_net
  FROM public.employees
  WHERE company_id = p_company_id
    AND COALESCE(is_active, true) = true;

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

  WITH receivables AS (
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato') AS cliente,
      'acconto' AS tipo,
      COALESCE(o.deposit_amount, 0) AS importo_eur,
      o.deposit_expected_date AS data_attesa
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_paid, false) = false AND o.deposit_expected_date IS NOT NULL
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'acconto_2',
      COALESCE(o.deposit_2_amount, 0),
      o.deposit_2_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_2_paid, false) = false AND o.deposit_2_expected_date IS NOT NULL
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'saldo',
      COALESCE(o.balance_amount, 0),
      o.balance_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.balance_paid, false) = false AND o.balance_expected_date IS NOT NULL
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'finanziamento',
      COALESCE(o.financing_amount, 0),
      o.financing_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.financing_paid, false) = false AND o.financing_expected_date IS NOT NULL
  )
  SELECT
    COALESCE(SUM(importo_eur) FILTER (WHERE data_attesa < CURRENT_DATE), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE data_attesa BETWEEN v_month_start AND v_month_end), 0),
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
  INTO v_overdue_receivables, v_future_receivables, v_overdue_clients, v_future_clients
  FROM receivables;

  v_total_to_cover := v_payroll_gross + v_open_costs_month + v_overdue_costs;
  v_available_receivables := v_overdue_receivables + v_future_receivables;
  v_cash_gap := GREATEST(v_total_to_cover - v_available_receivables, 0);
  v_revenue_target := CASE WHEN v_cash_gap = 0 THEN 0 ELSE v_cash_gap / v_margin END;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('mese', TO_CHAR(v_month_start, 'YYYY-MM'), 'dal', v_month_start, 'al', v_month_end),
    'ipotesi', jsonb_build_object(
      'margine_su_nuovo_fatturato_pct', ROUND((v_margin * 100)::numeric, 1),
      'nota', 'Il fatturato target serve a generare margine/cassa aggiuntiva; gli incassi clienti gia previsti riducono il gap.'
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
      'fatturato_da_generare_eur', ROUND(v_revenue_target::numeric, 2),
      'lettura', CASE
        WHEN v_cash_gap = 0 THEN 'Con i dati presenti, incassi previsti e recupero scaduti coprono i costi certificati del periodo.'
        ELSE 'Serve nuovo fatturato/margine o recupero extra crediti per coprire il gap di cassa del periodo.'
      END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_revenue_needed_next_month(uuid, date, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_revenue_needed_next_month(uuid, date, numeric) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_revenue_needed_next_month(uuid, date, numeric) IS
  'TOOL Silvio: calcola gap di cassa e fatturato target mese prossimo usando personale, company_costs, incassi previsti e crediti scaduti.';
