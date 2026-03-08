CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_company_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ,
  p_status_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_len        INTERVAL := p_date_to - p_date_from;
  v_prev_from         TIMESTAMPTZ := p_date_from - (p_date_to - p_date_from);
  v_prev_to           TIMESTAMPTZ := p_date_from;
  v_now               TIMESTAMPTZ := NOW();
  v_month_start       TIMESTAMPTZ := date_trunc('month', NOW());
  v_month_end         TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
  v_prev_month_start  TIMESTAMPTZ := date_trunc('month', NOW()) - INTERVAL '1 month';
  v_year_start        TIMESTAMPTZ := date_trunc('year', NOW());
  v_week_end          TIMESTAMPTZ := NOW() + INTERVAL '7 days';
  v_stats             JSONB;
  v_prev_stats        JSONB;
  v_recent_orders     JSONB;
  v_cash_flow         JSONB;
  v_ceo_strip         JSONB;
  v_urgent_items      JSONB;
  v_financial_alerts  JSONB;
  v_weekly_deadlines  JSONB;
  v_monthly_balance   JSONB;
  v_revenue_ytd       JSONB;
  v_aging             JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalOrders',        COUNT(*)::INT,
    'totalCustomers',     COUNT(DISTINCT o.customer_id)::INT,
    'openTickets',        (
      SELECT COUNT(*)::INT
      FROM tickets t
      WHERE t.company_id = p_company_id
        AND t.status::text NOT IN ('risolto','chiuso','closed','resolved','completato')
    ),
    'pendingRevenue',     COALESCE(SUM(CASE WHEN COALESCE(o.balance_amount,0) > 0 THEN o.balance_amount ELSE 0 END), 0),
    'pendingOrdersCount', COUNT(CASE WHEN COALESCE(o.balance_amount,0) > 0 THEN 1 END)::INT
  ) INTO v_stats
  FROM orders o
  WHERE o.company_id = p_company_id
    AND o.created_at BETWEEN p_date_from AND p_date_to
    AND (p_status_id IS NULL OR o.current_status_id = p_status_id);

  SELECT jsonb_build_object(
    'totalOrders',    COUNT(*)::INT,
    'totalCustomers', COUNT(DISTINCT o.customer_id)::INT
  ) INTO v_prev_stats
  FROM orders o
  WHERE o.company_id = p_company_id
    AND o.created_at BETWEEN v_prev_from AND v_prev_to
    AND (p_status_id IS NULL OR o.current_status_id = p_status_id);

  SELECT COALESCE(jsonb_agg(rq ORDER BY rq.created_at DESC), '[]'::jsonb)
  INTO v_recent_orders
  FROM (
    SELECT
      o.id,
      o.description,
      o.total_amount,
      o.created_at,
      jsonb_build_object('first_name', COALESCE(p.first_name,''), 'last_name', COALESCE(p.last_name,'')) AS customer,
      CASE WHEN os.id IS NOT NULL
           THEN jsonb_build_object('name', os.name, 'color', os.color)
           ELSE NULL END AS status
    FROM orders o
    LEFT JOIN profiles p  ON p.id  = o.customer_id
    LEFT JOIN order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = p_company_id
      AND (p_status_id IS NULL OR o.current_status_id = p_status_id)
    ORDER BY o.created_at DESC
    LIMIT 5
  ) rq;

  SELECT jsonb_build_object(
    'thisMonthIncome',  (SELECT COALESCE(SUM(total_amount),0) FROM orders
                         WHERE company_id = p_company_id AND created_at BETWEEN v_month_start AND v_month_end),
    'thisMonthOutflow', (SELECT COALESCE(SUM(amount),0) FROM company_costs
                         WHERE company_id = p_company_id AND due_date BETWEEN v_month_start::date AND v_month_end::date),
    'netCashFlow',      (SELECT COALESCE(SUM(total_amount),0) FROM orders
                         WHERE company_id = p_company_id AND created_at BETWEEN v_month_start AND v_month_end)
                      - (SELECT COALESCE(SUM(amount),0) FROM company_costs
                         WHERE company_id = p_company_id AND due_date BETWEEN v_month_start::date AND v_month_end::date),
    'nextMonth',        (SELECT COALESCE(SUM(total_amount),0) FROM orders
                         WHERE company_id = p_company_id AND created_at BETWEEN v_month_end AND (v_month_end + INTERVAL '1 month'))
                      - (SELECT COALESCE(SUM(amount),0) FROM company_costs
                         WHERE company_id = p_company_id AND due_date BETWEEN v_month_end::date AND (v_month_end + INTERVAL '1 month')::date)
  ) INTO v_cash_flow;

  SELECT jsonb_build_object(
    'revenueThisMonth',  COALESCE(SUM(CASE WHEN o.created_at >= v_month_start THEN o.total_amount ELSE 0 END), 0),
    'revenuePrevMonth',  COALESCE(SUM(CASE WHEN o.created_at < v_month_start AND o.created_at >= v_prev_month_start THEN o.total_amount ELSE 0 END), 0),
    'ordersThisMonth',   COUNT(CASE WHEN o.created_at >= v_month_start THEN 1 END)::INT,
    'ordersPrevMonth',   COUNT(CASE WHEN o.created_at < v_month_start AND o.created_at >= v_prev_month_start THEN 1 END)::INT,
    'marginThisMonth',   COALESCE(SUM(CASE WHEN o.created_at >= v_month_start THEN
                           o.total_amount
                           - COALESCE((SELECT SUM(oi.quantity * oi.purchase_price) FROM order_items oi WHERE oi.order_id = o.id), 0)
                           - COALESCE((SELECT SUM(oet.total_cost) FROM order_external_teams oet WHERE oet.order_id = o.id), 0)
                         ELSE 0 END), 0),
    'marginPrevMonth',   COALESCE(SUM(CASE WHEN o.created_at < v_month_start AND o.created_at >= v_prev_month_start THEN
                           o.total_amount
                           - COALESCE((SELECT SUM(oi.quantity * oi.purchase_price) FROM order_items oi WHERE oi.order_id = o.id), 0)
                           - COALESCE((SELECT SUM(oet.total_cost) FROM order_external_teams oet WHERE oet.order_id = o.id), 0)
                         ELSE 0 END), 0)
  ) INTO v_ceo_strip
  FROM orders o
  WHERE o.company_id = p_company_id
    AND o.created_at >= v_prev_month_start;

  SELECT COALESCE(jsonb_agg(uq), '[]'::jsonb)
  INTO v_urgent_items
  FROM (
    SELECT
      oi.id,
      oi.name,
      o.description                                                     AS "orderCode",
      COALESCE(p.first_name || ' ' || p.last_name, 'Cliente')          AS "customerName",
      GREATEST(0, (o.expected_date - v_now::date))                      AS "daysLeft"
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND o.expected_date IS NOT NULL
      AND o.expected_date BETWEEN v_now::date AND v_week_end::date
    ORDER BY o.expected_date ASC
    LIMIT 10
  ) uq;

  SELECT COALESCE(jsonb_agg(aq), '[]'::jsonb)
  INTO v_financial_alerts
  FROM (
    (SELECT 'warning'::TEXT AS type,
            'Saldo non pagato da oltre 30 giorni: ' || o.description AS message
     FROM orders o
     WHERE o.company_id = p_company_id
       AND COALESCE(o.balance_amount, 0) > 0
       AND o.created_at < v_now - INTERVAL '30 days'
     LIMIT 3)
    UNION ALL
    (SELECT 'error'::TEXT AS type,
            'Costo aziendale scaduto: ' || cc.name AS message
     FROM company_costs cc
     WHERE cc.company_id = p_company_id
       AND cc.is_paid = false
       AND cc.due_date < v_now::date
     LIMIT 3)
  ) aq;

  SELECT jsonb_build_object(
    'receivables', (
      SELECT COALESCE(jsonb_agg(rr ORDER BY rr."expectedDate"), '[]'::jsonb) FROM (
        SELECT o.description AS "orderDescription",
               COALESCE(p.first_name || ' ' || p.last_name, '') AS "customerName",
               COALESCE(o.balance_amount, 0) AS amount,
               o.expected_date::TEXT AS "expectedDate",
               GREATEST(0, (o.expected_date - v_now::date)) AS "daysLeft"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND COALESCE(o.balance_amount, 0) > 0
          AND o.expected_date BETWEEN v_now::date AND v_week_end::date
        ORDER BY o.expected_date ASC LIMIT 10
      ) rr
    ),
    'companyCosts', (
      SELECT COALESCE(jsonb_agg(cr ORDER BY cr."dueDate"), '[]'::jsonb) FROM (
        SELECT cc.name, cc.amount,
               cc.due_date::TEXT AS "dueDate",
               GREATEST(0, (cc.due_date - v_now::date)) AS "daysLeft"
        FROM company_costs cc
        WHERE cc.company_id = p_company_id
          AND cc.is_paid = false
          AND cc.due_date BETWEEN v_now::date AND v_week_end::date
        ORDER BY cc.due_date ASC LIMIT 10
      ) cr
    ),
    'upcomingWorks', (
      SELECT COALESCE(jsonb_agg(wr ORDER BY wr."workDate"), '[]'::jsonb) FROM (
        SELECT o.description AS "orderCode",
               COALESCE(p.first_name || ' ' || p.last_name, '') AS "customerName",
               o.expected_date::TEXT AS "workDate",
               GREATEST(0, (o.expected_date - v_now::date)) AS "daysLeft"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.expected_date BETWEEN v_now::date AND v_week_end::date
        ORDER BY o.expected_date ASC LIMIT 10
      ) wr
    )
  ) INTO v_weekly_deadlines;

  SELECT COALESCE(jsonb_agg(mb ORDER BY mb.month), '[]'::jsonb)
  INTO v_monthly_balance
  FROM (
    SELECT
      TO_CHAR(m.month, 'Mon YY') AS month,
      COALESCE((SELECT SUM(total_amount) FROM orders
                WHERE company_id = p_company_id AND date_trunc('month', created_at) = m.month), 0) AS entrate,
      COALESCE((SELECT SUM(amount) FROM company_costs
                WHERE company_id = p_company_id AND date_trunc('month', due_date::timestamptz) = m.month), 0) AS uscite
    FROM (SELECT generate_series(
           date_trunc('month', NOW() - INTERVAL '5 months'),
           date_trunc('month', NOW()),
           INTERVAL '1 month') AS month) m
  ) mb;

  SELECT COALESCE(jsonb_agg(ry ORDER BY ry.month), '[]'::jsonb)
  INTO v_revenue_ytd
  FROM (
    SELECT
      TO_CHAR(m.month, 'Mon') AS month,
      COALESCE((SELECT SUM(total_amount) FROM orders
                WHERE company_id = p_company_id
                  AND date_trunc('month', created_at) = m.month
                  AND (p_status_id IS NULL OR current_status_id = p_status_id)), 0) AS revenue
    FROM (SELECT generate_series(v_year_start, date_trunc('month', NOW()), INTERVAL '1 month') AS month) m
  ) ry;

  SELECT jsonb_build_object(
    'overdue',   COALESCE(SUM(CASE WHEN expected_date < v_now::date                              AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0),
    'thisWeek',  COALESCE(SUM(CASE WHEN expected_date BETWEEN v_now::date AND v_week_end::date   AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0),
    'thisMonth', COALESCE(SUM(CASE WHEN expected_date BETWEEN v_week_end::date AND v_month_end::date AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0),
    'future',    COALESCE(SUM(CASE WHEN expected_date > v_month_end::date                        AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0)
  ) INTO v_aging
  FROM orders
  WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'stats',            v_stats,
    'prevStats',        v_prev_stats,
    'recentOrders',     COALESCE(v_recent_orders, '[]'::jsonb),
    'cashFlow',         v_cash_flow,
    'ceoStrip',         v_ceo_strip,
    'urgentItems',      COALESCE(v_urgent_items, '[]'::jsonb),
    'financialAlerts',  COALESCE(v_financial_alerts, '[]'::jsonb),
    'weeklyDeadlines',  v_weekly_deadlines,
    'monthlyBalance',   COALESCE(v_monthly_balance, '[]'::jsonb),
    'revenueYTD',       COALESCE(v_revenue_ytd, '[]'::jsonb),
    'agingReceivables', v_aging
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;