
-- Add target and alert threshold columns to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS monthly_revenue_target NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_orders_target INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alert_late_orders_threshold INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS alert_open_tickets_threshold INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS alert_margin_min_pct NUMERIC(5,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS alert_runway_days_warning INTEGER DEFAULT 30;

-- RPC: get_cruscotto_stats
CREATE OR REPLACE FUNCTION get_cruscotto_stats(
  p_company_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_prev_from DATE := p_date_from - (p_date_to - p_date_from + 1);
  v_prev_to DATE   := p_date_from - 1;
BEGIN
  SELECT jsonb_build_object(
    'finance', jsonb_build_object(
      'revenue_current', (
        SELECT COALESCE(SUM(total_amount), 0)
        FROM orders
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN p_date_from AND p_date_to
          AND status NOT IN ('cancelled', 'annullato')
      ),
      'revenue_previous', (
        SELECT COALESCE(SUM(total_amount), 0)
        FROM orders
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN v_prev_from AND v_prev_to
          AND status NOT IN ('cancelled', 'annullato')
      ),
      'costs_current', (
        SELECT COALESCE(SUM(amount), 0)
        FROM company_costs
        WHERE company_id = p_company_id
          AND cost_date BETWEEN p_date_from AND p_date_to
      ),
      'costs_previous', (
        SELECT COALESCE(SUM(amount), 0)
        FROM company_costs
        WHERE company_id = p_company_id
          AND cost_date BETWEEN v_prev_from AND v_prev_to
      ),
      'margin_pct', (
        WITH order_costs AS (
          SELECT o.id, o.total_amount,
            COALESCE((SELECT SUM(COALESCE(oi.purchase_price,0) * COALESCE(oi.quantity,1)) FROM order_items oi WHERE oi.order_id = o.id), 0)
            + COALESCE((SELECT SUM(COALESCE(oe.total_cost,0)) FROM order_employees oe WHERE oe.order_id = o.id), 0)
            + COALESCE((SELECT SUM(COALESCE(oet.total_cost,0)) FROM order_external_teams oet WHERE oet.order_id = o.id), 0) AS total_cost
          FROM orders o
          WHERE o.company_id = p_company_id
            AND o.created_at::date BETWEEN p_date_from AND p_date_to
            AND o.status NOT IN ('cancelled', 'annullato')
        )
        SELECT CASE
          WHEN SUM(total_amount) > 0 THEN
            ROUND(((SUM(total_amount) - SUM(total_cost)) / SUM(total_amount)) * 100, 2)
          ELSE 0
        END
        FROM order_costs
      )
    ),
    'orders', jsonb_build_object(
      'total_current', (
        SELECT COUNT(*) FROM orders
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN p_date_from AND p_date_to
      ),
      'total_previous', (
        SELECT COUNT(*) FROM orders
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN v_prev_from AND v_prev_to
      ),
      'in_progress', (
        SELECT COUNT(*) FROM orders
        WHERE company_id = p_company_id
          AND status NOT IN ('completato', 'consegnato', 'cancelled', 'annullato')
      ),
      'late', (
        SELECT COUNT(*) FROM orders
        WHERE company_id = p_company_id
          AND expected_date < CURRENT_DATE
          AND work_end_date IS NULL
          AND status NOT IN ('completato', 'consegnato', 'cancelled', 'annullato')
      ),
      'avg_value', (
        SELECT ROUND(COALESCE(AVG(total_amount), 0), 2) FROM orders
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN p_date_from AND p_date_to
          AND total_amount > 0
      )
    ),
    'customers', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM customers WHERE company_id = p_company_id),
      'new_current', (
        SELECT COUNT(*) FROM customers
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN p_date_from AND p_date_to
      ),
      'new_previous', (
        SELECT COUNT(*) FROM customers
        WHERE company_id = p_company_id
          AND created_at::date BETWEEN v_prev_from AND v_prev_to
      )
    ),
    'tickets', jsonb_build_object(
      'open', (
        SELECT COUNT(*) FROM tickets
        WHERE company_id = p_company_id AND status = 'aperto'
      ),
      'resolved_current', (
        SELECT COUNT(*) FROM tickets
        WHERE company_id = p_company_id
          AND status = 'resolved'
          AND updated_at::date BETWEEN p_date_from AND p_date_to
      )
    ),
    'upcoming_payments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'amount', oi.amount,
        'expected_date', oi.expected_date,
        'order_number', o.order_number
      ) ORDER BY oi.expected_date), '[]'::jsonb)
      FROM order_installments oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.company_id = p_company_id
        AND oi.is_paid = false
        AND oi.expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    ),
    'monthly_revenue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'Mon YY'),
        'revenue', COALESCE(o.rev, 0),
        'costs', COALESCE(c.costs, 0)
      ) ORDER BY m.month_start), '[]'::jsonb)
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - interval '5 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS m(month_start)
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS m, SUM(total_amount) AS rev
        FROM orders
        WHERE company_id = p_company_id AND status NOT IN ('cancelled', 'annullato')
        GROUP BY 1
      ) o ON o.m = m.month_start
      LEFT JOIN (
        SELECT date_trunc('month', cost_date::timestamptz) AS m, SUM(amount) AS costs
        FROM company_costs WHERE company_id = p_company_id
        GROUP BY 1
      ) c ON c.m = m.month_start
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_cruscotto_stats TO authenticated;
