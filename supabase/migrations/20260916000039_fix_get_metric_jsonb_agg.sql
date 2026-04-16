-- ════════════════════════════════════════════════════════════════
-- FIX CRITICO: get_metric — jsonb_agg(r ORDER BY r->>'key') non
-- funziona su righe composite (il dispatcher era stato rotto dalla
-- migration 20260916000037).
--
-- Sintomo lato UI: widget chart_line/chart_area con
--   revenue_total + breakdown=month (e molti altri con breakdown
--   time-based o percentuale) ricevono dal resolver lo status
--   "error" con messaggio generico "Errore interno nel calcolo
--   della metrica" (SQLSTATE mapping ELSE branch).
--
-- Causa: in PostgreSQL `r->>'key'` è l'operatore jsonb→text e NON
-- accetta un composite row type come operando: la subquery ritorna
-- record (columns key/label/value), non jsonb. La RAISE restituisce
-- sqlstate 42883 ("operator does not exist: record ->> text") che
-- la mapping di resolve_dashboard non conosce → cade nell'ELSE
-- "Errore interno nel calcolo della metrica".
--
-- Questo bug era già stato corretto per il dispatcher base in
-- 20260416000200_fix_get_metric_breakdown_order.sql con il pattern
-- `jsonb_agg(jsonb_build_object('key', key, 'label', label,
-- 'value', value) ORDER BY key)`. La migration 37 ha riscritto
-- integralmente get_metric dimenticando di applicare lo stesso
-- pattern.
--
-- FIX: CREATE OR REPLACE di get_metric con il pattern corretto in
-- TUTTI i 34 punti dove c'era il bug. Nessuna modifica alla
-- signature né alla semantica: solo la costruzione del jsonb
-- aggregato è ora esplicita e tipizzata.
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
  -- 1. Auth & company context
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user' USING ERRCODE = '42501';
  END IF;

  -- 2. Load metric from catalog
  SELECT * INTO v_catalog FROM public.metric_catalog
  WHERE id = p_metric_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Metric % not found or inactive', p_metric_id USING ERRCODE = '22023';
  END IF;

  -- 3. Role check
  IF v_catalog.requires_role IS NOT NULL
     AND NOT public.has_role(v_user_id, v_catalog.requires_role::app_role) THEN
    RAISE EXCEPTION 'Insufficient role for metric %', p_metric_id USING ERRCODE = '42501';
  END IF;

  -- 4. Aggregation validation
  v_agg := COALESCE(p_aggregation, v_catalog.default_aggregation);
  IF NOT (v_agg = ANY(v_catalog.allowed_aggregations)) THEN
    RAISE EXCEPTION 'Aggregation % not allowed for metric %', v_agg, p_metric_id USING ERRCODE = '22023';
  END IF;

  -- 5. Breakdown validation
  IF NOT (v_breakdown = ANY(v_catalog.allowed_dimensions)) THEN
    RAISE EXCEPTION 'Breakdown % not allowed for metric %', v_breakdown, p_metric_id USING ERRCODE = '22023';
  END IF;

  -- 6. Period parsing
  SELECT from_ts, to_ts INTO v_from, v_to FROM public._dashboard_parse_period(p_filters);

  -- 7. Optional filter IDs (validati come UUID)
  v_status_id   := NULLIF(p_filters->>'status_id', '')::UUID;
  v_customer_id := NULLIF(p_filters->>'customer_id', '')::UUID;

  -- ─────────── DISPATCHER ───────────

  -- ═══ FINANZA (storico) ═══
  IF p_metric_id = 'revenue_total' THEN
    IF v_breakdown = 'none' THEN
      SELECT COALESCE(SUM(total_amount), 0) INTO v_value FROM orders
      WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        AND (v_status_id IS NULL OR current_status_id = v_status_id)
        AND (v_customer_id IS NULL OR customer_id = v_customer_id);
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               SUM(total_amount) AS value
        FROM orders WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               SUM(o.total_amount) AS value
        FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
        GROUP BY o.customer_id, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSIF v_breakdown = 'order_status' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value)), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value)), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
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

  -- ═══ ORDINI (storico) ═══
  ELSIF p_metric_id = 'orders_count' THEN
    IF v_breakdown = 'none' THEN
      SELECT COUNT(*) INTO v_value FROM orders
      WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        AND (v_status_id IS NULL OR current_status_id = v_status_id);
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               COUNT(*) AS value
        FROM orders WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'order_status' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(os.id::text, 'none') AS key,
               COALESCE(os.name, 'Senza stato') AS label,
               COUNT(*) AS value
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
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
      SELECT COALESCE(os.id::text, 'none') AS key,
             COALESCE(os.name, 'Senza stato') AS label,
             COUNT(*) AS value
      FROM orders o LEFT JOIN order_statuses os ON os.id = o.current_status_id
      WHERE o.company_id = v_company_id
      GROUP BY os.id, os.name
    ) r;

  -- ═══ CLIENTI (storico) ═══
  ELSIF p_metric_id = 'customers_total' THEN
    SELECT COUNT(DISTINCT customer_id) INTO v_value FROM orders
    WHERE company_id = v_company_id;

  ELSIF p_metric_id = 'customers_new' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', first_order), 'YYYY-MM') AS key,
               to_char(date_trunc('month', first_order), 'Mon YY')  AS label,
               COUNT(*) AS value
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
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
      SELECT o.customer_id::text AS key,
             COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
             SUM(o.total_amount) AS value
      FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
      WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
      GROUP BY o.customer_id, p.first_name, p.last_name
      LIMIT 10
    ) r;

  -- ═══ MARKETING (NUOVO) ═══
  ELSIF p_metric_id = 'leads_new' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               COUNT(*) AS value
        FROM marketing_contacts
        WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'week' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('week', created_at), 'YYYY-WW') AS key,
               to_char(date_trunc('week', created_at), '"Sett." WW') AS label,
               COUNT(*) AS value
        FROM marketing_contacts
        WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'day' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS key,
               to_char(date_trunc('day', created_at), 'DD/MM') AS label,
               COUNT(*) AS value
        FROM marketing_contacts
        WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'source' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(NULLIF(tags[1], ''), 'Diretto') AS key,
               COALESCE(NULLIF(tags[1], ''), 'Diretto') AS label,
               COUNT(*) AS value
        FROM marketing_contacts
        WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY tags
        LIMIT 10
      ) r;
    ELSE
      SELECT COUNT(*) INTO v_value FROM marketing_contacts
      WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to;
    END IF;

  ELSIF p_metric_id = 'opportunities_open' THEN
    IF v_breakdown = 'assigned_to' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(o.assigned_to::text, 'none') AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Non assegnato') AS label,
               COUNT(*) AS value
        FROM marketing_opportunities o
        LEFT JOIN profiles p ON p.id = o.assigned_to
        WHERE o.company_id = v_company_id AND o.status = 'open'
        GROUP BY o.assigned_to, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSIF v_breakdown = 'bucket' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(s.id::text, 'none') AS key,
               COALESCE(s.name, 'Nessuna fase') AS label,
               COUNT(*) AS value
        FROM marketing_opportunities o
        LEFT JOIN marketing_pipeline_stages s ON s.id = o.stage_id
        WHERE o.company_id = v_company_id AND o.status = 'open'
        GROUP BY s.id, s.name
      ) r;
    ELSE
      SELECT COUNT(*) INTO v_value FROM marketing_opportunities
      WHERE company_id = v_company_id AND status = 'open';
    END IF;

  ELSIF p_metric_id = 'pipeline_value' THEN
    IF v_breakdown = 'assigned_to' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(o.assigned_to::text, 'none') AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Non assegnato') AS label,
               COALESCE(SUM(o.value), 0) AS value
        FROM marketing_opportunities o
        LEFT JOIN profiles p ON p.id = o.assigned_to
        WHERE o.company_id = v_company_id AND o.status = 'open'
        GROUP BY o.assigned_to, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSIF v_breakdown = 'bucket' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(s.id::text, 'none') AS key,
               COALESCE(s.name, 'Nessuna fase') AS label,
               COALESCE(SUM(o.value), 0) AS value
        FROM marketing_opportunities o
        LEFT JOIN marketing_pipeline_stages s ON s.id = o.stage_id
        WHERE o.company_id = v_company_id AND o.status = 'open'
        GROUP BY s.id, s.name
      ) r;
    ELSE
      SELECT COALESCE(SUM(value), 0) INTO v_value FROM marketing_opportunities
      WHERE company_id = v_company_id AND status = 'open';
    END IF;

  ELSIF p_metric_id = 'opportunities_won' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', updated_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', updated_at), 'Mon YY')  AS label,
               COUNT(*) AS value
        FROM marketing_opportunities
        WHERE company_id = v_company_id AND status = 'closed_won'
          AND updated_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'assigned_to' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(o.assigned_to::text, 'none') AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Non assegnato') AS label,
               COUNT(*) AS value
        FROM marketing_opportunities o
        LEFT JOIN profiles p ON p.id = o.assigned_to
        WHERE o.company_id = v_company_id AND o.status = 'closed_won'
          AND o.updated_at BETWEEN v_from AND v_to
        GROUP BY o.assigned_to, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSE
      SELECT COUNT(*) INTO v_value FROM marketing_opportunities
      WHERE company_id = v_company_id AND status = 'closed_won'
        AND updated_at BETWEEN v_from AND v_to;
    END IF;

  -- ═══ APPUNTAMENTI (NUOVO) ═══
  ELSIF p_metric_id = 'appointments_count' THEN
    IF v_breakdown = 'day' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(appointment_date, 'YYYY-MM-DD') AS key,
               to_char(appointment_date, 'DD/MM') AS label,
               COUNT(*) AS value
        FROM appointments
        WHERE company_id = v_company_id
          AND appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'week' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('week', appointment_date), 'YYYY-WW') AS key,
               to_char(date_trunc('week', appointment_date), '"Sett." WW') AS label,
               COUNT(*) AS value
        FROM appointments
        WHERE company_id = v_company_id
          AND appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', appointment_date), 'YYYY-MM') AS key,
               to_char(date_trunc('month', appointment_date), 'Mon YY') AS label,
               COUNT(*) AS value
        FROM appointments
        WHERE company_id = v_company_id
          AND appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'assigned_to' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(a.assigned_to::text, 'none') AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Non assegnato') AS label,
               COUNT(*) AS value
        FROM appointments a
        LEFT JOIN profiles p ON p.id = a.assigned_to
        WHERE a.company_id = v_company_id
          AND a.appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY a.assigned_to, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSIF v_breakdown = 'category' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(NULLIF(appointment_type, ''), 'Generico') AS key,
               COALESCE(NULLIF(appointment_type, ''), 'Generico') AS label,
               COUNT(*) AS value
        FROM appointments
        WHERE company_id = v_company_id
          AND appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY appointment_type
      ) r;
    ELSE
      SELECT COUNT(*) INTO v_value FROM appointments
      WHERE company_id = v_company_id
        AND appointment_date BETWEEN v_from::date AND v_to::date;
    END IF;

  ELSIF p_metric_id = 'appointments_completed' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', appointment_date), 'YYYY-MM') AS key,
               to_char(date_trunc('month', appointment_date), 'Mon YY') AS label,
               COUNT(*) AS value
        FROM appointments
        WHERE company_id = v_company_id AND is_completed = true
          AND appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'assigned_to' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(a.assigned_to::text, 'none') AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Non assegnato') AS label,
               COUNT(*) AS value
        FROM appointments a
        LEFT JOIN profiles p ON p.id = a.assigned_to
        WHERE a.company_id = v_company_id AND a.is_completed = true
          AND a.appointment_date BETWEEN v_from::date AND v_to::date
        GROUP BY a.assigned_to, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSE
      SELECT COUNT(*) INTO v_value FROM appointments
      WHERE company_id = v_company_id AND is_completed = true
        AND appointment_date BETWEEN v_from::date AND v_to::date;
    END IF;

  -- ═══ TESORERIA (NUOVO) ═══
  ELSIF p_metric_id = 'cash_balance' THEN
    IF v_breakdown = 'category' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(NULLIF(account_type, ''), 'altro') AS key,
               COALESCE(NULLIF(account_type, ''), 'Altro') AS label,
               COALESCE(SUM(current_balance), 0) AS value
        FROM bank_accounts
        WHERE company_id = v_company_id AND COALESCE(is_active, true) = true
        GROUP BY account_type
      ) r;
    ELSE
      SELECT COALESCE(SUM(current_balance), 0) INTO v_value FROM bank_accounts
      WHERE company_id = v_company_id AND COALESCE(is_active, true) = true;
    END IF;

  ELSIF p_metric_id = 'bank_inflows' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', booking_date), 'YYYY-MM') AS key,
               to_char(date_trunc('month', booking_date), 'Mon YY') AS label,
               COALESCE(SUM(amount), 0) AS value
        FROM bank_transactions
        WHERE company_id = v_company_id
          AND transaction_type = 'credit'
          AND booking_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'category' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(NULLIF(category, ''), 'Senza categoria') AS key,
               COALESCE(NULLIF(category, ''), 'Senza categoria') AS label,
               COALESCE(SUM(amount), 0) AS value
        FROM bank_transactions
        WHERE company_id = v_company_id
          AND transaction_type = 'credit'
          AND booking_date BETWEEN v_from::date AND v_to::date
        GROUP BY category
      ) r;
    ELSE
      SELECT COALESCE(SUM(amount), 0) INTO v_value FROM bank_transactions
      WHERE company_id = v_company_id
        AND transaction_type = 'credit'
        AND booking_date BETWEEN v_from::date AND v_to::date;
    END IF;

  ELSIF p_metric_id = 'bank_outflows' THEN
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY key), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', booking_date), 'YYYY-MM') AS key,
               to_char(date_trunc('month', booking_date), 'Mon YY') AS label,
               COALESCE(SUM(ABS(amount)), 0) AS value
        FROM bank_transactions
        WHERE company_id = v_company_id
          AND transaction_type = 'debit'
          AND booking_date BETWEEN v_from::date AND v_to::date
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'category' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT COALESCE(NULLIF(category, ''), 'Senza categoria') AS key,
               COALESCE(NULLIF(category, ''), 'Senza categoria') AS label,
               COALESCE(SUM(ABS(amount)), 0) AS value
        FROM bank_transactions
        WHERE company_id = v_company_id
          AND transaction_type = 'debit'
          AND booking_date BETWEEN v_from::date AND v_to::date
        GROUP BY category
      ) r;
    ELSE
      SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_value FROM bank_transactions
      WHERE company_id = v_company_id
        AND transaction_type = 'debit'
        AND booking_date BETWEEN v_from::date AND v_to::date;
    END IF;

  -- ═══ MAGAZZINO (NUOVO) ═══
  ELSIF p_metric_id = 'stock_low' THEN
    SELECT COUNT(*) INTO v_value FROM warehouse_stock
    WHERE company_id = v_company_id
      AND COALESCE(min_stock_level, 0) > 0
      AND quantity <= min_stock_level;

  -- ═══ INSTALLMENTS (NUOVO) ═══
  ELSIF p_metric_id = 'installments_overdue' THEN
    IF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               COALESCE(SUM(i.amount), 0) AS value
        FROM order_installments i
        JOIN orders o ON o.id = i.order_id
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = v_company_id
          AND COALESCE(i.is_paid, false) = false
          AND i.expected_date < CURRENT_DATE
        GROUP BY o.customer_id, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSE
      SELECT COALESCE(SUM(i.amount), 0) INTO v_value
      FROM order_installments i
      JOIN orders o ON o.id = i.order_id
      WHERE o.company_id = v_company_id
        AND COALESCE(i.is_paid, false) = false
        AND i.expected_date < CURRENT_DATE;
    END IF;

  ELSE
    RAISE EXCEPTION 'Metric % not implemented yet', p_metric_id USING ERRCODE = '22023';
  END IF;

  -- ─────────── Return ───────────
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

COMMENT ON FUNCTION public.get_metric(TEXT, JSONB, TEXT, TEXT) IS
  'Dashboard Builder dispatcher v3 (fix 39): pattern jsonb_agg(jsonb_build_object(...) ORDER BY col) per evitare record->>text. Base: 20260916000037_dashboard_builder_extended_metrics.sql.';

GRANT EXECUTE ON FUNCTION public.get_metric(TEXT, JSONB, TEXT, TEXT) TO authenticated;
