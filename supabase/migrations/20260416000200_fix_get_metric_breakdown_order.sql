-- ════════════════════════════════════════════════════════════════
-- FIX: get_metric breakdown ORDER BY fallisce con record ->> text
-- ════════════════════════════════════════════════════════════════
-- Sintomo: SELECT get_metric('orders_count', {period:'ytd'}, null, 'month')
--          → ERROR 42883 "operator does not exist: record ->> unknown"
-- Causa: jsonb_agg(r ORDER BY r->>'key') non tipa la subquery come jsonb
--        quando r è il record della subquery (non un jsonb).
-- Fix: costruire jsonb_build_object esplicitamente dentro jsonb_agg,
--      ORDER BY sui campi nominati della subquery.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_metric(
  p_metric_id   TEXT,
  p_filters     JSONB   DEFAULT '{}'::jsonb,
  p_aggregation TEXT    DEFAULT NULL,
  p_breakdown   TEXT    DEFAULT 'none'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_company_id  UUID;
  v_catalog     public.metric_catalog%ROWTYPE;
  v_from        TIMESTAMPTZ;
  v_to          TIMESTAMPTZ;
  v_agg         TEXT;
  v_breakdown   TEXT := COALESCE(p_breakdown, 'none');
  v_value       NUMERIC;
  v_breakdown_rows JSONB := '[]'::jsonb;
  v_status_id   UUID;
  v_customer_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_catalog FROM public.metric_catalog
  WHERE id = p_metric_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Metric % not found or inactive', p_metric_id USING ERRCODE = '22023';
  END IF;

  IF v_catalog.requires_role IS NOT NULL
     AND NOT public.has_role(v_user_id, v_catalog.requires_role::app_role) THEN
    RAISE EXCEPTION 'Insufficient role for metric %', p_metric_id USING ERRCODE = '42501';
  END IF;

  v_agg := COALESCE(p_aggregation, v_catalog.default_aggregation);
  IF NOT (v_agg = ANY(v_catalog.allowed_aggregations)) THEN
    RAISE EXCEPTION 'Aggregation % not allowed for metric %', v_agg, p_metric_id USING ERRCODE = '22023';
  END IF;

  IF NOT (v_breakdown = ANY(v_catalog.allowed_dimensions)) THEN
    RAISE EXCEPTION 'Breakdown % not allowed for metric %', v_breakdown, p_metric_id USING ERRCODE = '22023';
  END IF;

  SELECT from_ts, to_ts INTO v_from, v_to FROM public._dashboard_parse_period(p_filters);

  v_status_id   := NULLIF(p_filters->>'status_id', '')::UUID;
  v_customer_id := NULLIF(p_filters->>'customer_id', '')::UUID;

  -- ═══ FINANZA ═══
  IF p_metric_id = 'revenue_total' THEN
    IF v_breakdown = 'none' THEN
      SELECT COALESCE(SUM(total_amount), 0) INTO v_value FROM orders
      WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        AND (v_status_id IS NULL OR current_status_id = v_status_id)
        AND (v_customer_id IS NULL OR customer_id = v_customer_id);
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               SUM(total_amount) AS value
        FROM orders WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               SUM(o.total_amount) AS value
        FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
        GROUP BY o.customer_id, p.first_name, p.last_name
        ORDER BY SUM(o.total_amount) DESC
        LIMIT 20
      ) r;
    ELSIF v_breakdown = 'order_status' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT COALESCE(os.id::text, 'none') AS key,
               COALESCE(os.name, 'Senza stato') AS label,
               SUM(o.total_amount) AS value
        FROM orders o LEFT JOIN order_statuses os ON os.id = o.current_status_id
        WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
        GROUP BY os.id, os.name
      ) r;
    END IF;

  ELSIF p_metric_id = 'revenue_real' THEN
    IF v_breakdown = 'none' THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_value FROM invoice_payments
      WHERE company_id = v_company_id AND payment_date BETWEEN v_from::date AND v_to::date;
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS key,
               to_char(date_trunc('month', payment_date), 'Mon YY')  AS label,
               SUM(amount) AS value
        FROM invoice_payments WHERE company_id = v_company_id AND payment_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    END IF;

  ELSIF p_metric_id = 'margin_total' THEN
    SELECT COALESCE(SUM(
      o.total_amount
      - COALESCE((SELECT SUM(quantity * COALESCE(purchase_price, 0)) FROM order_items WHERE order_id = o.id), 0)
      - COALESCE((SELECT SUM(total_cost) FROM order_external_teams WHERE order_id = o.id), 0)
    ), 0) INTO v_value FROM orders o
    WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to;

  ELSIF p_metric_id = 'payments_real' THEN
    IF v_breakdown = 'category' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT COALESCE(category, 'senza categoria') AS key,
               COALESCE(category, 'senza categoria') AS label,
               SUM(amount) AS value
        FROM company_costs WHERE company_id = v_company_id AND is_paid = true
          AND paid_date BETWEEN v_from::date AND v_to::date
        GROUP BY category
      ) r;
    ELSE
      SELECT COALESCE(SUM(amount), 0) INTO v_value FROM company_costs
      WHERE company_id = v_company_id AND is_paid = true
        AND paid_date BETWEEN v_from::date AND v_to::date;
    END IF;

  ELSIF p_metric_id = 'overdue_receivables' THEN
    IF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               SUM(o.balance_amount) AS value
        FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = v_company_id
          AND o.expected_date < CURRENT_DATE
          AND COALESCE(o.balance_amount, 0) > 0
        GROUP BY o.customer_id, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSE
      SELECT COALESCE(SUM(balance_amount), 0) INTO v_value FROM orders
      WHERE company_id = v_company_id
        AND expected_date < CURRENT_DATE
        AND COALESCE(balance_amount, 0) > 0;
    END IF;

  ELSIF p_metric_id = 'cashflow_forecast_30d' THEN
    SELECT
      COALESCE((SELECT SUM(balance_amount) FROM orders
                WHERE company_id = v_company_id
                  AND expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                  AND COALESCE(balance_amount, 0) > 0), 0)
      -
      COALESCE((SELECT SUM(amount) FROM company_costs
                WHERE company_id = v_company_id AND is_paid = false
                  AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0)
    INTO v_value;

  -- ═══ ORDINI ═══
  ELSIF p_metric_id = 'orders_count' THEN
    IF v_breakdown = 'none' THEN
      SELECT COUNT(*) INTO v_value FROM orders
      WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        AND (v_status_id IS NULL OR current_status_id = v_status_id);
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               COUNT(*)::numeric AS value
        FROM orders WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'order_status' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT COALESCE(os.id::text, 'none') AS key,
               COALESCE(os.name, 'Senza stato') AS label,
               COUNT(*)::numeric AS value
        FROM orders o LEFT JOIN order_statuses os ON os.id = o.current_status_id
        WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
        GROUP BY os.id, os.name
      ) r;
    END IF;

  ELSIF p_metric_id = 'orders_open' THEN
    SELECT COUNT(*) INTO v_value FROM orders o
    LEFT JOIN order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = v_company_id
      AND COALESCE(lower(os.name), '') NOT IN ('completato','chiuso','consegnato','annullato');

  ELSIF p_metric_id = 'order_avg_value' THEN
    SELECT COALESCE(AVG(total_amount), 0) INTO v_value FROM orders
    WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to;

  ELSIF p_metric_id = 'order_avg_duration' THEN
    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (expected_date::timestamptz - created_at)) / 86400), 0) INTO v_value
    FROM orders
    WHERE company_id = v_company_id
      AND expected_date IS NOT NULL
      AND created_at BETWEEN v_from AND v_to;

  ELSIF p_metric_id = 'orders_by_status' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
    INTO v_breakdown_rows FROM (
      SELECT COALESCE(os.id::text, 'none') AS key,
             COALESCE(os.name, 'Senza stato') AS label,
             COUNT(*)::numeric AS value
      FROM orders o LEFT JOIN order_statuses os ON os.id = o.current_status_id
      WHERE o.company_id = v_company_id
      GROUP BY os.id, os.name
    ) r;

  -- ═══ CLIENTI ═══
  ELSIF p_metric_id = 'customers_total' THEN
    SELECT COUNT(DISTINCT customer_id) INTO v_value FROM orders
    WHERE company_id = v_company_id;

  ELSIF p_metric_id = 'customers_new' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb)
      INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', first_order), 'YYYY-MM') AS key,
               to_char(date_trunc('month', first_order), 'Mon YY')  AS label,
               COUNT(*)::numeric AS value
        FROM (
          SELECT customer_id, MIN(created_at) AS first_order
          FROM orders WHERE company_id = v_company_id
          GROUP BY customer_id
        ) x
        WHERE first_order BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSE
      SELECT COUNT(*) INTO v_value FROM (
        SELECT customer_id, MIN(created_at) AS first_order
        FROM orders WHERE company_id = v_company_id
        GROUP BY customer_id
      ) x WHERE first_order BETWEEN v_from AND v_to;
    END IF;

  ELSIF p_metric_id = 'customers_top' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb)
    INTO v_breakdown_rows FROM (
      SELECT o.customer_id::text AS key,
             COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
             SUM(o.total_amount) AS value
      FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
      WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
      GROUP BY o.customer_id, p.first_name, p.last_name
      ORDER BY SUM(o.total_amount) DESC
      LIMIT 10
    ) r;

  ELSE
    RAISE EXCEPTION 'Metric % not implemented yet', p_metric_id USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'value',     v_value,
    'breakdown', v_breakdown_rows,
    'meta', jsonb_build_object(
      'metric_id',     p_metric_id,
      'aggregation',   v_agg,
      'breakdown_dim', v_breakdown,
      'period_from',   v_from,
      'period_to',     v_to,
      'generated_at',  NOW()
    )
  );
END $$;
