
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_company_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_status_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_now timestamptz := now();
  v_today date := CURRENT_DATE;
  v_this_month_end date := (date_trunc('month', v_now) + interval '1 month - 1 day')::date;
  v_next_month_end date := (date_trunc('month', v_now) + interval '2 months - 1 day')::date;
  v_seven_days date := v_today + 7;
  v_ytd_from timestamptz := date_trunc('year', v_now);

  -- Period duration for prev period
  v_duration interval := p_date_to - p_date_from;
  v_prev_from timestamptz := p_date_from - v_duration - interval '1 day';
  v_prev_to timestamptz := p_date_from - interval '1 second';

  -- Stats
  v_total_orders bigint;
  v_total_customers bigint;
  v_open_tickets bigint;
  v_prev_orders bigint;
  v_prev_customers bigint;

  -- Pending revenue
  v_pending_revenue numeric := 0;
  v_pending_orders_count bigint := 0;
  v_overdue_payments numeric := 0;
  v_overdue_count int := 0;

  -- Cash flow
  v_this_month_income numeric := 0;
  v_this_month_outflow numeric := 0;
  v_next_month numeric := 0;

  -- CEO strip
  v_revenue_this numeric := 0;
  v_margin_this numeric := 0;
  v_orders_this bigint := 0;
  v_revenue_prev numeric := 0;
  v_margin_prev numeric := 0;
  v_orders_prev bigint := 0;

  -- Aging
  v_aging_overdue numeric := 0;
  v_aging_this_week numeric := 0;
  v_aging_this_month numeric := 0;
  v_aging_future numeric := 0;

  v_recent_orders jsonb;
  v_urgent_items jsonb;
  v_weekly_receivables jsonb := '[]'::jsonb;
  v_weekly_costs jsonb;
  v_weekly_works jsonb;
  v_financial_alerts jsonb := '[]'::jsonb;
  v_monthly_balance jsonb := '[]'::jsonb;
  v_revenue_ytd jsonb := '[]'::jsonb;

  rec RECORD;
  v_margin_count int;
  v_margin_sum numeric;
BEGIN
  -- 1) Total orders in period
  IF p_status_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_orders FROM orders WHERE company_id = p_company_id AND created_at >= p_date_from AND created_at <= p_date_to AND current_status_id = p_status_id;
    SELECT COUNT(DISTINCT customer_id) INTO v_total_customers FROM orders WHERE company_id = p_company_id AND created_at >= p_date_from AND created_at <= p_date_to AND current_status_id = p_status_id;
  ELSE
    SELECT COUNT(*) INTO v_total_orders FROM orders WHERE company_id = p_company_id AND created_at >= p_date_from AND created_at <= p_date_to;
    SELECT COUNT(DISTINCT customer_id) INTO v_total_customers FROM orders WHERE company_id = p_company_id AND created_at >= p_date_from AND created_at <= p_date_to;
  END IF;

  -- 2) Open tickets
  SELECT COUNT(*) INTO v_open_tickets FROM tickets WHERE company_id = p_company_id AND status = 'aperto';

  -- 3) Prev period
  SELECT COUNT(*) INTO v_prev_orders FROM orders WHERE company_id = p_company_id AND created_at >= v_prev_from AND created_at <= v_prev_to;
  SELECT COUNT(DISTINCT customer_id) INTO v_prev_customers FROM orders WHERE company_id = p_company_id AND created_at >= v_prev_from AND created_at <= v_prev_to;

  -- 4) Recent orders
  SELECT COALESCE(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb) INTO v_recent_orders
  FROM (
    SELECT o.id, o.description, o.total_amount, o.created_at,
      jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) AS customer,
      CASE WHEN os.id IS NOT NULL THEN jsonb_build_object('name', os.name, 'color', os.color) ELSE NULL END AS status
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.customer_id
    LEFT JOIN order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = p_company_id AND o.created_at >= p_date_from AND o.created_at <= p_date_to
    ORDER BY o.created_at DESC LIMIT 5
  ) sub;

  -- 5) Pending revenue, aging, cash flow from unpaid installments
  FOR rec IN
    SELECT o.description,
      p.first_name, p.last_name,
      o.deposit_amount, o.deposit_paid, o.deposit_expected_date,
      o.deposit_2_amount, o.deposit_2_paid, o.deposit_2_expected_date,
      o.balance_amount, o.balance_paid, o.balance_expected_date,
      o.financing_amount, o.financing_paid, o.financing_expected_date
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
  LOOP
    DECLARE
      order_pending numeric := 0;
      -- helper variables
      amt numeric;
      dt date;
      paid boolean;
      cust_name text := COALESCE(rec.first_name, '') || ' ' || COALESCE(rec.last_name, '');
      days_left int;
    BEGIN
      -- Process 4 payment types
      FOR i IN 1..4 LOOP
        CASE i
          WHEN 1 THEN paid := rec.deposit_paid; amt := COALESCE(rec.deposit_amount, 0); dt := rec.deposit_expected_date;
          WHEN 2 THEN paid := rec.deposit_2_paid; amt := COALESCE(rec.deposit_2_amount, 0); dt := rec.deposit_2_expected_date;
          WHEN 3 THEN paid := rec.balance_paid; amt := COALESCE(rec.balance_amount, 0); dt := rec.balance_expected_date;
          WHEN 4 THEN paid := rec.financing_paid; amt := COALESCE(rec.financing_amount, 0); dt := rec.financing_expected_date;
        END CASE;

        IF NOT COALESCE(paid, false) AND amt > 0 THEN
          order_pending := order_pending + amt;

          -- Overdue
          IF dt IS NOT NULL AND dt < v_today THEN
            v_overdue_payments := v_overdue_payments + amt;
            v_overdue_count := v_overdue_count + 1;
          END IF;

          -- Aging
          IF dt IS NULL THEN
            v_aging_future := v_aging_future + amt;
          ELSIF dt < v_today THEN
            v_aging_overdue := v_aging_overdue + amt;
          ELSIF dt <= v_seven_days THEN
            v_aging_this_week := v_aging_this_week + amt;
            -- Weekly receivable
            days_left := (dt - v_today);
            v_weekly_receivables := v_weekly_receivables || jsonb_build_array(
              jsonb_build_object('orderDescription', COALESCE(rec.description, 'Ordine'), 'customerName', cust_name, 'amount', amt, 'expectedDate', dt, 'daysLeft', GREATEST(0, days_left))
            );
          ELSIF dt <= v_this_month_end THEN
            v_aging_this_month := v_aging_this_month + amt;
          ELSE
            v_aging_future := v_aging_future + amt;
          END IF;

          -- Cash flow
          IF dt IS NOT NULL THEN
            IF dt <= v_this_month_end THEN
              v_this_month_income := v_this_month_income + amt;
            ELSIF dt <= v_next_month_end THEN
              v_next_month := v_next_month + amt;
            END IF;
          END IF;
        END IF;
      END LOOP;

      IF order_pending > 0 THEN
        v_pending_revenue := v_pending_revenue + order_pending;
        v_pending_orders_count := v_pending_orders_count + 1;
      END IF;
    END;
  END LOOP;

  -- 6) Unpaid costs this month
  SELECT COALESCE(SUM(amount), 0) INTO v_this_month_outflow
  FROM company_costs WHERE company_id = p_company_id AND is_paid = false AND due_date <= v_this_month_end::text;

  -- 7) CEO strip - current period revenue & margin
  SELECT COUNT(*), COALESCE(SUM(o.total_amount), 0),
    COALESCE(SUM(
      CASE WHEN o.total_amount > 0 AND (item_cost.total + labor_cost.total) > 0
        THEN ((o.total_amount - (item_cost.total + labor_cost.total)) / o.total_amount) * 100
        ELSE 0 END
    ), 0),
    COUNT(*) FILTER (WHERE o.total_amount > 0 AND (item_cost.total + labor_cost.total) > 0)
  INTO v_orders_this, v_revenue_this, v_margin_sum, v_margin_count
  FROM orders o
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(oi.purchase_price, 0) * COALESCE(oi.quantity, 1)), 0) AS total
    FROM order_items oi WHERE oi.order_id = o.id
  ) item_cost ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(oe.total_cost, 0)), 0) + COALESCE(SUM(COALESCE(oet.total_cost, 0)), 0) AS total
    FROM order_employees oe
    FULL OUTER JOIN order_external_teams oet ON oet.order_id = o.id
    WHERE oe.order_id = o.id
  ) labor_cost ON true
  WHERE o.company_id = p_company_id AND o.created_at >= p_date_from AND o.created_at <= p_date_to;

  v_margin_this := CASE WHEN v_margin_count > 0 THEN v_margin_sum / v_margin_count ELSE 0 END;

  -- CEO strip - prev period
  SELECT COUNT(*), COALESCE(SUM(o.total_amount), 0),
    COALESCE(SUM(
      CASE WHEN o.total_amount > 0 AND (item_cost.total + labor_cost.total) > 0
        THEN ((o.total_amount - (item_cost.total + labor_cost.total)) / o.total_amount) * 100
        ELSE 0 END
    ), 0),
    COUNT(*) FILTER (WHERE o.total_amount > 0 AND (item_cost.total + labor_cost.total) > 0)
  INTO v_orders_prev, v_revenue_prev, v_margin_sum, v_margin_count
  FROM orders o
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(oi.purchase_price, 0) * COALESCE(oi.quantity, 1)), 0) AS total
    FROM order_items oi WHERE oi.order_id = o.id
  ) item_cost ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(oe.total_cost, 0)), 0) + COALESCE(SUM(COALESCE(oet.total_cost, 0)), 0) AS total
    FROM order_employees oe
    FULL OUTER JOIN order_external_teams oet ON oet.order_id = o.id
    WHERE oe.order_id = o.id
  ) labor_cost ON true
  WHERE o.company_id = p_company_id AND o.created_at >= v_prev_from AND o.created_at <= v_prev_to;

  v_margin_prev := CASE WHEN v_margin_count > 0 THEN v_margin_sum / v_margin_count ELSE 0 END;

  -- 8) Urgent items (order_items with posa <= 7 days, not ready)
  SELECT COALESCE(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb) INTO v_urgent_items
  FROM (
    SELECT oi.id, oi.name,
      o.order_code AS "orderCode",
      p.first_name || ' ' || p.last_name AS "customerName",
      GREATEST(0, (COALESCE(o.expected_date, o.work_start_date) - v_today)) AS "daysLeft"
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND oi.status NOT IN ('installato', 'in_magazzino')
      AND COALESCE(o.expected_date, o.work_start_date) IS NOT NULL
      AND COALESCE(o.expected_date, o.work_start_date) >= v_today
      AND COALESCE(o.expected_date, o.work_start_date) <= v_seven_days
    ORDER BY COALESCE(o.expected_date, o.work_start_date)
    LIMIT 5
  ) sub;

  -- 9) Weekly costs due
  SELECT COALESCE(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb) INTO v_weekly_costs
  FROM (
    SELECT name, amount, due_date AS "dueDate",
      GREATEST(0, (due_date::date - v_today)) AS "daysLeft"
    FROM company_costs
    WHERE company_id = p_company_id AND is_paid = false
      AND due_date >= v_today::text AND due_date <= v_seven_days::text
    ORDER BY due_date
  ) sub;

  -- 10) Upcoming works
  SELECT COALESCE(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb) INTO v_weekly_works
  FROM (
    SELECT o.order_code AS "orderCode",
      COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS "customerName",
      o.work_start_date AS "workDate",
      GREATEST(0, (o.work_start_date - v_today)) AS "daysLeft"
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND o.work_start_date >= v_today AND o.work_start_date <= v_seven_days
    ORDER BY o.work_start_date
  ) sub;

  -- 11) Financial alerts
  IF v_overdue_count > 0 THEN
    v_financial_alerts := v_financial_alerts || jsonb_build_array(
      jsonb_build_object('type', 'error', 'message', v_overdue_count || ' pagamenti scaduti per €' || ROUND(v_overdue_payments, 2))
    );
  END IF;
  IF v_this_month_outflow > v_this_month_income AND v_this_month_outflow > 0 THEN
    v_financial_alerts := v_financial_alerts || jsonb_build_array(
      jsonb_build_object('type', 'warning', 'message', 'Uscite previste (€' || ROUND(v_this_month_outflow, 2) || ') superiori agli incassi (€' || ROUND(v_this_month_income, 2) || ') questo mese')
    );
  END IF;

  -- 12) Monthly balance (last 6 months)
  FOR i IN REVERSE 5..0 LOOP
    DECLARE
      ms date := (date_trunc('month', v_now) - (i || ' months')::interval)::date;
      me date := ((date_trunc('month', v_now) - (i || ' months')::interval) + interval '1 month - 1 day')::date;
      v_entrate numeric := 0;
      v_uscite numeric := 0;
      v_month_label text;
    BEGIN
      v_month_label := to_char(ms, 'Mon');

      -- Entrate: unpaid expected in this month
      SELECT COALESCE(SUM(amt), 0) INTO v_entrate FROM (
        SELECT CASE WHEN NOT COALESCE(deposit_paid, false) AND deposit_expected_date >= ms AND deposit_expected_date <= me THEN COALESCE(deposit_amount, 0) ELSE 0 END +
               CASE WHEN NOT COALESCE(deposit_2_paid, false) AND deposit_2_expected_date >= ms AND deposit_2_expected_date <= me THEN COALESCE(deposit_2_amount, 0) ELSE 0 END +
               CASE WHEN NOT COALESCE(balance_paid, false) AND balance_expected_date >= ms AND balance_expected_date <= me THEN COALESCE(balance_amount, 0) ELSE 0 END +
               CASE WHEN NOT COALESCE(financing_paid, false) AND financing_expected_date >= ms AND financing_expected_date <= me THEN COALESCE(financing_amount, 0) ELSE 0 END AS amt
        FROM orders WHERE company_id = p_company_id
      ) t;

      SELECT COALESCE(SUM(amount), 0) INTO v_uscite
      FROM company_costs WHERE company_id = p_company_id AND due_date >= ms::text AND due_date <= me::text;

      v_monthly_balance := v_monthly_balance || jsonb_build_array(
        jsonb_build_object('month', v_month_label, 'entrate', v_entrate, 'uscite', v_uscite)
      );
    END;
  END LOOP;

  -- 13) Revenue YTD (per month)
  FOR i IN 0..EXTRACT(MONTH FROM v_now)::int - 1 LOOP
    DECLARE
      ms timestamptz := date_trunc('year', v_now) + (i || ' months')::interval;
      me timestamptz := date_trunc('year', v_now) + ((i + 1) || ' months')::interval - interval '1 second';
      v_rev numeric;
      v_ml text;
    BEGIN
      v_ml := to_char(ms, 'Mon');
      SELECT COALESCE(SUM(total_amount), 0) INTO v_rev
      FROM orders WHERE company_id = p_company_id AND created_at >= ms AND created_at <= me;
      v_revenue_ytd := v_revenue_ytd || jsonb_build_array(
        jsonb_build_object('month', v_ml, 'revenue', v_rev)
      );
    END;
  END LOOP;

  -- Build result
  result := jsonb_build_object(
    'stats', jsonb_build_object(
      'totalOrders', v_total_orders,
      'totalCustomers', v_total_customers,
      'openTickets', v_open_tickets,
      'pendingRevenue', v_pending_revenue,
      'pendingOrdersCount', v_pending_orders_count
    ),
    'prevStats', jsonb_build_object(
      'totalOrders', v_prev_orders,
      'totalCustomers', v_prev_customers
    ),
    'recentOrders', v_recent_orders,
    'cashFlow', jsonb_build_object(
      'thisMonthIncome', v_this_month_income,
      'thisMonthOutflow', v_this_month_outflow,
      'netCashFlow', v_this_month_income - v_this_month_outflow,
      'nextMonth', v_next_month
    ),
    'ceoStrip', jsonb_build_object(
      'revenueThisMonth', v_revenue_this,
      'revenuePrevMonth', v_revenue_prev,
      'marginThisMonth', v_margin_this,
      'marginPrevMonth', v_margin_prev,
      'ordersThisMonth', v_orders_this,
      'ordersPrevMonth', v_orders_prev
    ),
    'urgentItems', v_urgent_items,
    'financialAlerts', v_financial_alerts,
    'weeklyDeadlines', jsonb_build_object(
      'receivables', v_weekly_receivables,
      'companyCosts', v_weekly_costs,
      'upcomingWorks', v_weekly_works
    ),
    'monthlyBalance', v_monthly_balance,
    'revenueYTD', v_revenue_ytd,
    'agingReceivables', jsonb_build_object(
      'overdue', v_aging_overdue,
      'thisWeek', v_aging_this_week,
      'thisMonth', v_aging_this_month,
      'future', v_aging_future
    )
  );

  RETURN result;
END;
$function$;
