-- ════════════════════════════════════════════════════════════════
-- Dashboard Builder v1 — Sprint 1.13 + 1.14
-- Seed catalogo metriche (20) + RPC get_metric
--
-- La RPC get_metric è l'UNICO ingresso dati dal frontend.
-- Usa dispatcher CASE per metric_id (no SQL libera).
-- Valida: ruolo, aggregazione ∈ allowed, breakdown ∈ allowed, period format.
--
-- 11 metriche attive (finanza + ordini) testate su tabelle esistenti.
-- 9 metriche placeholder (is_active=false) — attivate dopo verifica schema.
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- Helper: parse period filter JSONB → (from_ts, to_ts)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._dashboard_parse_period(p_filters JSONB)
RETURNS TABLE(from_ts TIMESTAMPTZ, to_ts TIMESTAMPTZ)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_period TEXT := COALESCE(p_filters->>'period', 'this_month');
  v_now TIMESTAMPTZ := NOW();
BEGIN
  CASE v_period
    WHEN 'today'        THEN from_ts := date_trunc('day', v_now);  to_ts := v_now;
    WHEN 'yesterday'    THEN from_ts := date_trunc('day', v_now - INTERVAL '1 day'); to_ts := date_trunc('day', v_now);
    WHEN 'last_7_days'  THEN from_ts := v_now - INTERVAL '7 days'; to_ts := v_now;
    WHEN 'last_30_days' THEN from_ts := v_now - INTERVAL '30 days'; to_ts := v_now;
    WHEN 'this_week'    THEN from_ts := date_trunc('week', v_now); to_ts := v_now;
    WHEN 'this_month'   THEN from_ts := date_trunc('month', v_now); to_ts := v_now;
    WHEN 'last_month'   THEN from_ts := date_trunc('month', v_now) - INTERVAL '1 month';
                             to_ts   := date_trunc('month', v_now);
    WHEN 'this_year'    THEN from_ts := date_trunc('year', v_now); to_ts := v_now;
    WHEN 'ytd'          THEN from_ts := date_trunc('year', v_now); to_ts := v_now;
    WHEN 'custom'       THEN
      from_ts := COALESCE((p_filters->>'from')::TIMESTAMPTZ, date_trunc('month', v_now));
      to_ts   := COALESCE((p_filters->>'to')::TIMESTAMPTZ, v_now);
    ELSE from_ts := date_trunc('month', v_now); to_ts := v_now;
  END CASE;
  RETURN NEXT;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- SEED metric_catalog (20 metriche)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO public.metric_catalog
  (id, name, description, category, value_type, default_aggregation, allowed_aggregations, allowed_dimensions, sql_template, requires_role, is_active)
VALUES
-- FINANZA (6) — tutte attive
('revenue_total',     'Fatturato totale',          'Somma degli importi degli ordini creati nel periodo',                    'finanza', 'currency', 'sum',   ARRAY['sum','avg','min','max'], ARRAY['none','month','week','day','customer','order_status'], 'SEE get_metric dispatcher', NULL, true),
('revenue_real',      'Incassi reali',             'Somma pagamenti registrati in invoice_payments nel periodo',             'finanza', 'currency', 'sum',   ARRAY['sum','avg','min','max'], ARRAY['none','month','week','day'],                           'SEE get_metric dispatcher', NULL, true),
('margin_total',      'Margine operativo',         'Fatturato − costi diretti (articoli + squadre esterne)',                  'finanza', 'currency', 'sum',   ARRAY['sum','avg','min','max'], ARRAY['none','month'],                                        'SEE get_metric dispatcher', 'company_admin', true),
('payments_real',     'Pagamenti reali',           'Somma costi aziendali marcati come pagati nel periodo',                   'finanza', 'currency', 'sum',   ARRAY['sum','avg'],              ARRAY['none','month','category'],                             'SEE get_metric dispatcher', NULL, true),
('overdue_receivables','Crediti scaduti',          'Saldo residuo ordini con expected_date < oggi',                           'finanza', 'currency', 'sum',   ARRAY['sum','count'],            ARRAY['none','customer'],                                     'SEE get_metric dispatcher', NULL, true),
('cashflow_forecast_30d','Forecast cassa 30gg',    'Incassi attesi − costi pianificati nei prossimi 30 giorni',               'finanza', 'currency', 'sum',   ARRAY['sum'],                    ARRAY['none'],                                                'SEE get_metric dispatcher', NULL, true),

-- ORDINI (5) — tutte attive
('orders_count',      'Numero ordini',             'Conteggio ordini creati nel periodo',                                     'ordini',  'count',    'count', ARRAY['count'],                  ARRAY['none','month','week','day','order_status','customer'], 'SEE get_metric dispatcher', NULL, true),
('orders_open',       'Ordini aperti',             'Ordini non ancora completati',                                            'ordini',  'count',    'count', ARRAY['count'],                  ARRAY['none','order_status','customer'],                      'SEE get_metric dispatcher', NULL, true),
('order_avg_value',   'Valore medio ordine',       'Media di total_amount nel periodo',                                        'ordini',  'currency', 'avg',   ARRAY['avg'],                    ARRAY['none','month'],                                        'SEE get_metric dispatcher', NULL, true),
('order_avg_duration','Durata media cantiere',     'Media giorni tra creazione e expected_date',                               'ordini',  'duration', 'avg',   ARRAY['avg'],                    ARRAY['none','month'],                                        'SEE get_metric dispatcher', NULL, true),
('orders_by_status',  'Ordini per stato (pipeline)','Distribuzione ordini per stato corrente',                                 'ordini',  'count',    'count', ARRAY['count'],                  ARRAY['order_status'],                                        'SEE get_metric dispatcher', NULL, true),

-- CLIENTI (3) — attive
('customers_total',   'Clienti totali',            'Clienti distinti con almeno un ordine',                                   'clienti', 'count',    'count', ARRAY['count'],                  ARRAY['none'],                                                'SEE get_metric dispatcher', NULL, true),
('customers_new',     'Nuovi clienti',             'Clienti col primo ordine nel periodo',                                     'clienti', 'count',    'count', ARRAY['count'],                  ARRAY['none','month'],                                        'SEE get_metric dispatcher', NULL, true),
('customers_top',     'Top clienti per fatturato', 'Clienti ordinati per total_amount DESC',                                  'clienti', 'currency', 'sum',   ARRAY['sum'],                    ARRAY['customer'],                                            'SEE get_metric dispatcher', NULL, true),

-- MAGAZZINO (3) — placeholder, da verificare schema
('items_urgent',      'Articoli urgenti (7gg)',    'Articoli non ricevuti per cantieri entro 7 giorni',                       'magazzino','count',   'count', ARRAY['count'],                  ARRAY['none'],                                                'TODO: verify order_items.status values', NULL, false),
('stock_value',       'Valore stock magazzino',    'Somma (quantita * prezzo_acquisto) da stock_items',                       'magazzino','currency','sum',   ARRAY['sum'],                    ARRAY['none','category'],                                     'TODO: verify stock_items schema', NULL, false),
('items_below_min',   'Articoli sotto scorta',     'Stock items con quantita < minimo',                                       'magazzino','count',   'count', ARRAY['count'],                  ARRAY['none'],                                                'TODO: verify stock_items.minimum_quantity', NULL, false),

-- TEAM (3) — placeholder, da verificare schema
('hours_worked_total','Ore lavorate totali',       'Somma ore da team_activities nel periodo',                                'team',    'duration', 'sum',   ARRAY['sum'],                    ARRAY['none','month','team','member'],                        'TODO: verify team_activities schema', 'company_admin', false),
('teams_active_today','Squadre in cantiere oggi',  'Team con attivita in corso oggi',                                          'team',    'count',    'count', ARRAY['count'],                  ARRAY['none'],                                                'TODO: verify team_activities schema', NULL, false),
('productivity_hpo',  'Ore per ordine',            'Rapporto ore lavorate / ordini completati',                                'team',    'duration', 'avg',   ARRAY['avg'],                    ARRAY['none','month'],                                        'TODO: verify team_activities schema', 'company_admin', false)

ON CONFLICT (id) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  category             = EXCLUDED.category,
  value_type           = EXCLUDED.value_type,
  default_aggregation  = EXCLUDED.default_aggregation,
  allowed_aggregations = EXCLUDED.allowed_aggregations,
  allowed_dimensions   = EXCLUDED.allowed_dimensions,
  sql_template         = EXCLUDED.sql_template,
  requires_role        = EXCLUDED.requires_role,
  is_active            = EXCLUDED.is_active;

-- ──────────────────────────────────────────────────────────────────
-- RPC get_metric — unico ingresso dati per widget
-- ──────────────────────────────────────────────────────────────────
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

  -- ──────────────────────────────────────────────────────────────
  -- 8. DISPATCHER — per ogni metric_id, SQL hard-coded e tipizzata
  -- ──────────────────────────────────────────────────────────────

  -- ═══ FINANZA ═══
  IF p_metric_id = 'revenue_total' THEN
    IF v_breakdown = 'none' THEN
      SELECT COALESCE(SUM(total_amount), 0) INTO v_value FROM orders
      WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        AND (v_status_id IS NULL OR current_status_id = v_status_id)
        AND (v_customer_id IS NULL OR customer_id = v_customer_id);
    ELSIF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(r ORDER BY r->>'key'), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               SUM(total_amount) AS value
        FROM orders WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value')::numeric DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               SUM(o.total_amount) AS value
        FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
        GROUP BY o.customer_id, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSIF v_breakdown = 'order_status' THEN
      SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(r ORDER BY r->>'key'), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value')::numeric DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
      SELECT COALESCE(jsonb_agg(r ORDER BY r->>'key'), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS key,
               to_char(date_trunc('month', created_at), 'Mon YY')  AS label,
               COUNT(*) AS value
        FROM orders WHERE company_id = v_company_id AND created_at BETWEEN v_from AND v_to
        GROUP BY 1, 2
      ) r;
    ELSIF v_breakdown = 'order_status' THEN
      SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value')::numeric DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value')::numeric DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
      SELECT COALESCE(os.id::text, 'none') AS key,
             COALESCE(os.name, 'Senza stato') AS label,
             COUNT(*) AS value
      FROM orders o LEFT JOIN order_statuses os ON os.id = o.current_status_id
      WHERE o.company_id = v_company_id
      GROUP BY os.id, os.name
    ) r;

  -- ═══ CLIENTI ═══
  ELSIF p_metric_id = 'customers_total' THEN
    SELECT COUNT(DISTINCT customer_id) INTO v_value FROM orders
    WHERE company_id = v_company_id;

  ELSIF p_metric_id = 'customers_new' THEN
    -- Clienti col primo ordine nel periodo
    IF v_breakdown = 'month' THEN
      SELECT COALESCE(jsonb_agg(r ORDER BY r->>'key'), '[]'::jsonb) INTO v_breakdown_rows FROM (
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
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value')::numeric DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
      SELECT o.customer_id::text AS key,
             COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
             SUM(o.total_amount) AS value
      FROM orders o LEFT JOIN profiles p ON p.id = o.customer_id
      WHERE o.company_id = v_company_id AND o.created_at BETWEEN v_from AND v_to
      GROUP BY o.customer_id, p.first_name, p.last_name
      LIMIT 10
    ) r;

  ELSE
    RAISE EXCEPTION 'Metric % not implemented yet', p_metric_id USING ERRCODE = '22023';
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 9. Return
  -- ──────────────────────────────────────────────────────────────
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
  'Dashboard Builder: unico entry-point dati per widget. Valida ruolo, aggregazione, breakdown, periodo. Dispatcher CASE per metric_id — no SQL libera. Ritorna {value, breakdown[], meta}.';

-- Grant execute agli utenti autenticati
GRANT EXECUTE ON FUNCTION public.get_metric(TEXT, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public._dashboard_parse_period(JSONB) TO authenticated;
