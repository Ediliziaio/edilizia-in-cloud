-- Fix dashboard gestione: normalizza residui incasso e aggiunge KPI gestione coerenti

CREATE OR REPLACE FUNCTION public.normalized_order_balance_amount(
  p_total numeric,
  p_deposit numeric,
  p_deposit_2 numeric,
  p_financing numeric,
  p_balance numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN GREATEST(COALESCE(p_total,0),0) <= 0 THEN GREATEST(COALESCE(p_balance,0),0)
    WHEN (
      GREATEST(COALESCE(p_deposit,0),0)
      + GREATEST(COALESCE(p_deposit_2,0),0)
      + GREATEST(COALESCE(p_financing,0),0)
      + GREATEST(COALESCE(p_balance,0),0)
    ) > GREATEST(COALESCE(p_total,0),0) * 1.01
      OR GREATEST(COALESCE(p_balance,0),0) > GREATEST(
        GREATEST(COALESCE(p_total,0),0)
        - GREATEST(COALESCE(p_deposit,0),0)
        - GREATEST(COALESCE(p_deposit_2,0),0)
        - GREATEST(COALESCE(p_financing,0),0),
        0
      ) * 1.01
    THEN GREATEST(
      GREATEST(COALESCE(p_total,0),0)
      - GREATEST(COALESCE(p_deposit,0),0)
      - GREATEST(COALESCE(p_deposit_2,0),0)
      - GREATEST(COALESCE(p_financing,0),0),
      0
    )
    WHEN GREATEST(COALESCE(p_balance,0),0) = 0 THEN GREATEST(
      GREATEST(COALESCE(p_total,0),0)
      - GREATEST(COALESCE(p_deposit,0),0)
      - GREATEST(COALESCE(p_deposit_2,0),0)
      - GREATEST(COALESCE(p_financing,0),0),
      0
    )
    ELSE GREATEST(COALESCE(p_balance,0),0)
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalized_order_collected_amount(
  p_total numeric,
  p_deposit numeric,
  p_deposit_paid boolean,
  p_deposit_2 numeric,
  p_deposit_2_paid boolean,
  p_financing numeric,
  p_financing_paid boolean,
  p_balance numeric,
  p_balance_paid boolean
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  WITH parts AS (
    SELECT
      GREATEST(COALESCE(p_total,0),0) AS total,
      GREATEST(COALESCE(p_deposit,0),0) AS deposit1,
      GREATEST(COALESCE(p_deposit_2,0),0) AS deposit2,
      GREATEST(COALESCE(p_financing,0),0) AS financing,
      public.normalized_order_balance_amount(p_total, p_deposit, p_deposit_2, p_financing, p_balance) AS balance
  ), collected AS (
    SELECT
      (CASE WHEN COALESCE(p_deposit_paid,false) THEN deposit1 ELSE 0 END)
      + (CASE WHEN COALESCE(p_deposit_2_paid,false) THEN deposit2 ELSE 0 END)
      + (CASE WHEN COALESCE(p_financing_paid,false) THEN financing ELSE 0 END)
      + (CASE WHEN COALESCE(p_balance_paid,false) THEN balance ELSE 0 END) AS amount,
      total
    FROM parts
  )
  SELECT CASE WHEN total > 0 THEN LEAST(amount, total) ELSE amount END FROM collected;
$$;

CREATE OR REPLACE FUNCTION public.normalized_order_due_amount(
  p_total numeric,
  p_deposit numeric,
  p_deposit_paid boolean,
  p_deposit_2 numeric,
  p_deposit_2_paid boolean,
  p_financing numeric,
  p_financing_paid boolean,
  p_balance numeric,
  p_balance_paid boolean
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  WITH parts AS (
    SELECT
      GREATEST(COALESCE(p_total,0),0) AS total,
      GREATEST(COALESCE(p_deposit,0),0) AS deposit1,
      GREATEST(COALESCE(p_deposit_2,0),0) AS deposit2,
      GREATEST(COALESCE(p_financing,0),0) AS financing,
      public.normalized_order_balance_amount(p_total, p_deposit, p_deposit_2, p_financing, p_balance) AS balance
  ), amounts AS (
    SELECT
      (CASE WHEN NOT COALESCE(p_deposit_paid,false) THEN deposit1 ELSE 0 END)
      + (CASE WHEN NOT COALESCE(p_deposit_2_paid,false) THEN deposit2 ELSE 0 END)
      + (CASE WHEN financing > 0 AND NOT COALESCE(p_financing_paid,false) THEN financing ELSE 0 END)
      + (CASE WHEN NOT COALESCE(p_balance_paid,false) THEN balance ELSE 0 END) AS due,
      public.normalized_order_collected_amount(
        p_total, p_deposit, p_deposit_paid, p_deposit_2, p_deposit_2_paid,
        p_financing, p_financing_paid, p_balance, p_balance_paid
      ) AS collected,
      total
    FROM parts
  )
  SELECT CASE WHEN total > 0 THEN LEAST(due, GREATEST(total - collected, 0)) ELSE due END FROM amounts;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_company_id UUID,
  p_date_from  TIMESTAMPTZ,
  p_date_to    TIMESTAMPTZ,
  p_status_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now               TIMESTAMPTZ := NOW();
  v_month_start       TIMESTAMPTZ := date_trunc('month', NOW());
  v_month_end         TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
  v_prev_month_start  TIMESTAMPTZ := date_trunc('month', NOW()) - INTERVAL '1 month';
  v_year_start        TIMESTAMPTZ := date_trunc('year', NOW());
  v_week_end          TIMESTAMPTZ := NOW() + INTERVAL '7 days';
  v_forecast_end      TIMESTAMPTZ := NOW() + INTERVAL '30 days';

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

  v_has_invoice_payments BOOLEAN;
  v_has_paid_costs       BOOLEAN;
  v_has_real_data        BOOLEAN;

  v_real_income       NUMERIC(14,2) := 0;
  v_real_outflow      NUMERIC(14,2) := 0;
  v_forecast_in       NUMERIC(14,2) := 0;
  v_forecast_out      NUMERIC(14,2) := 0;
BEGIN
  ------------------------------------------------------------
  -- Flag: l'azienda ha dati di cassa reali?
  ------------------------------------------------------------
  v_has_invoice_payments := EXISTS(
    SELECT 1 FROM invoice_payments WHERE company_id = p_company_id LIMIT 1
  );
  v_has_paid_costs := EXISTS(
    SELECT 1 FROM company_costs WHERE company_id = p_company_id AND is_paid = true LIMIT 1
  );
  v_has_real_data := v_has_invoice_payments OR v_has_paid_costs;

  ------------------------------------------------------------
  -- Cashflow REALE del mese corrente
  ------------------------------------------------------------
  SELECT COALESCE(SUM(amount), 0) INTO v_real_income
  FROM invoice_payments
  WHERE company_id = p_company_id
    AND payment_date BETWEEN v_month_start::date AND (v_month_end - INTERVAL '1 day')::date;

  SELECT COALESCE(SUM(amount), 0) INTO v_real_outflow
  FROM company_costs
  WHERE company_id = p_company_id
    AND is_paid = true
    AND paid_date BETWEEN v_month_start::date AND (v_month_end - INTERVAL '1 day')::date;

  ------------------------------------------------------------
  -- Forecast 30 giorni: crediti attesi - costi pianificati
  ------------------------------------------------------------
  SELECT COALESCE(SUM(public.normalized_order_due_amount(
    total_amount, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
    financing_amount, financing_paid, balance_amount, balance_paid
  )), 0) INTO v_forecast_in
  FROM orders
  WHERE company_id = p_company_id
    AND expected_date IS NOT NULL
    AND expected_date BETWEEN v_now::date AND v_forecast_end::date
    AND public.normalized_order_due_amount(
      total_amount, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
      financing_amount, financing_paid, balance_amount, balance_paid
    ) > 0;

  SELECT COALESCE(SUM(amount), 0) INTO v_forecast_out
  FROM company_costs
  WHERE company_id = p_company_id
    AND is_paid = false
    AND due_date BETWEEN v_now::date AND v_forecast_end::date;

  ------------------------------------------------------------
  -- STATS & PREV STATS
  ------------------------------------------------------------
  SELECT jsonb_build_object(
    'totalOrders',        COUNT(*)::INT,
    'totalCustomers',     COUNT(DISTINCT o.customer_id)::INT,
    'openTickets',        (
      SELECT COUNT(*)::INT
      FROM tickets t
      WHERE t.company_id = p_company_id
        AND t.status::text NOT IN ('risolto','chiuso','closed','resolved','completato')
    ),
    'totalRevenue',       COALESCE(SUM(o.total_amount), 0),
    'collectedRevenue',   COALESCE(SUM(public.normalized_order_collected_amount(
      o.total_amount, o.deposit_amount, o.deposit_paid, o.deposit_2_amount, o.deposit_2_paid,
      o.financing_amount, o.financing_paid, o.balance_amount, o.balance_paid
    )), 0),
    'pendingRevenue',     COALESCE(SUM(public.normalized_order_due_amount(
      o.total_amount, o.deposit_amount, o.deposit_paid, o.deposit_2_amount, o.deposit_2_paid,
      o.financing_amount, o.financing_paid, o.balance_amount, o.balance_paid
    )), 0),
    'pendingOrdersCount', COUNT(CASE WHEN public.normalized_order_due_amount(
      o.total_amount, o.deposit_amount, o.deposit_paid, o.deposit_2_amount, o.deposit_2_paid,
      o.financing_amount, o.financing_paid, o.balance_amount, o.balance_paid
    ) > 0 THEN 1 END)::INT
  ) INTO v_stats
  FROM orders o
  WHERE o.company_id = p_company_id
    AND o.created_at BETWEEN p_date_from AND p_date_to
    AND (p_status_id IS NULL OR o.current_status_id = p_status_id);

  SELECT jsonb_build_object(
    'totalOrders',    COUNT(*)::INT,
    'totalCustomers', COUNT(DISTINCT customer_id)::INT
  ) INTO v_prev_stats
  FROM orders
  WHERE company_id = p_company_id
    AND created_at BETWEEN (p_date_from - (p_date_to - p_date_from)) AND p_date_from
    AND (p_status_id IS NULL OR current_status_id = p_status_id);

  ------------------------------------------------------------
  -- RECENT ORDERS
  ------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(rq), '[]'::jsonb) INTO v_recent_orders
  FROM (
    SELECT
      o.id,
      o.description,
      o.total_amount,
      o.created_at,
      jsonb_build_object(
        'first_name', COALESCE(p.first_name, ''),
        'last_name',  COALESCE(p.last_name, '')
      ) AS customer,
      CASE WHEN os.id IS NULL THEN NULL
        ELSE jsonb_build_object('name', os.name, 'color', os.color)
      END AS status
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.customer_id
    LEFT JOIN order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = p_company_id
      AND (p_status_id IS NULL OR o.current_status_id = p_status_id)
    ORDER BY o.created_at DESC
    LIMIT 5
  ) rq;

  ------------------------------------------------------------
  -- CASH FLOW — vecchi campi (commerciale) + nuovi (reale)
  ------------------------------------------------------------
  SELECT jsonb_build_object(
    -- Campi LEGACY (dato commerciale: ordinato vs pianificato)
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
                         WHERE company_id = p_company_id AND due_date BETWEEN v_month_end::date AND (v_month_end + INTERVAL '1 month')::date),
    -- NUOVI campi: cashflow REALE
    'realIncome',       v_real_income,
    'realOutflow',      v_real_outflow,
    'realNet',          v_real_income - v_real_outflow,
    'forecastNext30d',  v_forecast_in - v_forecast_out,
    'forecastInflow',   v_forecast_in,
    'forecastOutflow',  v_forecast_out,
    'hasRealData',      v_has_real_data
  ) INTO v_cash_flow;

  ------------------------------------------------------------
  -- CEO STRIP (invariato)
  ------------------------------------------------------------
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

  ------------------------------------------------------------
  -- URGENT WAREHOUSE ITEMS (invariato)
  ------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(uq), '[]'::jsonb) INTO v_urgent_items
  FROM (
    SELECT
      oi.id,
      oi.name,
      o.description                                                     AS "orderCode",
      COALESCE(p.first_name || ' ' || p.last_name, 'Cliente')          AS "customerName",
      GREATEST(0, (o.expected_date - v_now::date))                      AS "daysLeft"
    FROM order_items oi
    JOIN orders o   ON o.id = oi.order_id
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND o.expected_date IS NOT NULL
      AND o.expected_date BETWEEN v_now::date AND (v_now + INTERVAL '7 days')::date
      AND oi.status IN ('da_ordinare', 'ordinato', 'in_arrivo')
    ORDER BY o.expected_date ASC
    LIMIT 20
  ) uq;

  ------------------------------------------------------------
  -- FINANCIAL ALERTS (aggiornati per usare dati REALI se disponibili)
  ------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(fa), '[]'::jsonb) INTO v_financial_alerts
  FROM (
    -- Alert: cashflow reale negativo (se dati reali disponibili)
    SELECT 'error' AS type,
           'Saldo di cassa del mese negativo: ' || to_char(v_real_income - v_real_outflow, 'FM999G999G990D00 €') AS message
    WHERE v_has_real_data AND (v_real_income - v_real_outflow) < 0

    UNION ALL
    -- Alert: forecast 30gg negativo
    SELECT 'warning' AS type,
           'Forecast 30 giorni negativo: incassi previsti insufficienti per coprire i costi pianificati' AS message
    WHERE (v_forecast_in - v_forecast_out) < 0
      AND v_forecast_out > 0

    UNION ALL
    -- Alert: crediti scaduti importanti
    SELECT 'warning' AS type,
           'Crediti scaduti per ' || to_char(
             (SELECT COALESCE(SUM(public.normalized_order_due_amount(
                 total_amount, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
                 financing_amount, financing_paid, balance_amount, balance_paid
               )), 0) FROM orders
              WHERE company_id = p_company_id
                AND expected_date < v_now::date
                AND public.normalized_order_due_amount(
                  total_amount, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
                  financing_amount, financing_paid, balance_amount, balance_paid
                ) > 0), 'FM999G999G990D00 €'
           ) AS message
    WHERE EXISTS (
      SELECT 1 FROM orders
      WHERE company_id = p_company_id
        AND expected_date < v_now::date
        AND public.normalized_order_due_amount(
          total_amount, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
          financing_amount, financing_paid, balance_amount, balance_paid
        ) > 1000
    )
  ) fa;

  ------------------------------------------------------------
  -- OPERATIONAL AGENDA (mantiene la chiave weeklyDeadlines per compatibilità,
  -- ma espone fino a 30 giorni così la dashboard può mostrare settimana/mese)
  ------------------------------------------------------------
  SELECT jsonb_build_object(
    'receivables', COALESCE((
      SELECT jsonb_agg(r)
      FROM (
        SELECT
          o.description                          AS "orderDescription",
          COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS "customerName",
          public.normalized_order_due_amount(
            o.total_amount, o.deposit_amount, o.deposit_paid, o.deposit_2_amount, o.deposit_2_paid,
            o.financing_amount, o.financing_paid, o.balance_amount, o.balance_paid
          ) AS amount,
          o.expected_date::text                  AS "expectedDate",
          GREATEST(0, (o.expected_date - v_now::date))::int AS "daysLeft"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.expected_date IS NOT NULL
          AND o.expected_date BETWEEN v_now::date AND v_forecast_end::date
          AND public.normalized_order_due_amount(
            o.total_amount, o.deposit_amount, o.deposit_paid, o.deposit_2_amount, o.deposit_2_paid,
            o.financing_amount, o.financing_paid, o.balance_amount, o.balance_paid
          ) > 0
        ORDER BY o.expected_date ASC
        LIMIT 10
      ) r
    ), '[]'::jsonb),
    'companyCosts', COALESCE((
      SELECT jsonb_agg(c)
      FROM (
        SELECT
          name,
          amount,
          due_date::text                                       AS "dueDate",
          GREATEST(0, (due_date - v_now::date))::int           AS "daysLeft"
        FROM company_costs
        WHERE company_id = p_company_id
          AND is_paid = false
          AND due_date BETWEEN v_now::date AND v_forecast_end::date
        ORDER BY due_date ASC
        LIMIT 10
      ) c
    ), '[]'::jsonb),
    'upcomingWorks', COALESCE((
      SELECT jsonb_agg(w)
      FROM (
        SELECT
          COALESCE(o.order_code, o.description, 'Commessa')                AS "orderCode",
          COALESCE(p.first_name || ' ' || p.last_name, 'Cliente')          AS "customerName",
          CASE
            WHEN o.work_start_date <= v_now::date
             AND COALESCE(o.work_end_date, o.work_start_date) >= v_now::date
            THEN v_now::date
            ELSE o.work_start_date
          END::text                                                        AS "workDate",
          GREATEST(0, (
            CASE
              WHEN o.work_start_date <= v_now::date
               AND COALESCE(o.work_end_date, o.work_start_date) >= v_now::date
              THEN v_now::date
              ELSE o.work_start_date
            END - v_now::date
          ))::int                                                          AS "daysLeft",
          'order'                                                          AS source,
          CASE
            WHEN COALESCE(o.work_end_date, o.work_start_date) > o.work_start_date
            THEN 'Lavori in corso'
            ELSE 'Inizio lavori'
          END                                                             AS "kindLabel"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.work_start_date IS NOT NULL
          AND o.work_start_date <= v_forecast_end::date
          AND COALESCE(o.work_end_date, o.work_start_date) >= v_now::date

        UNION ALL

        SELECT
          COALESCE(o.order_code, o.description, 'Commessa')                AS "orderCode",
          COALESCE(p.first_name || ' ' || p.last_name, 'Cliente')          AS "customerName",
          o.expected_date::text                                            AS "workDate",
          GREATEST(0, (o.expected_date - v_now::date))::int                AS "daysLeft",
          'order'                                                          AS source,
          'Posa prevista'                                                  AS "kindLabel"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.expected_date IS NOT NULL
          AND o.expected_date BETWEEN v_now::date AND v_forecast_end::date
          AND (o.work_start_date IS NULL OR o.expected_date <> o.work_start_date)

        UNION ALL

        SELECT
          COALESCE(o.order_code, o.description, 'Commessa')                AS "orderCode",
          COALESCE(p.first_name || ' ' || p.last_name, 'Cliente')          AS "customerName",
          o.warehouse_arrival_date::text                                   AS "workDate",
          GREATEST(0, (o.warehouse_arrival_date - v_now::date))::int       AS "daysLeft",
          'warehouse'                                                      AS source,
          'Arrivo materiali'                                               AS "kindLabel"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.warehouse_arrival_date IS NOT NULL
          AND o.warehouse_arrival_date BETWEEN v_now::date AND v_forecast_end::date

        UNION ALL

        SELECT
          COALESCE(o.order_code, o.description, a.title, 'Appuntamento')    AS "orderCode",
          COALESCE(op.first_name || ' ' || op.last_name, cp.first_name || ' ' || cp.last_name, 'Cliente') AS "customerName",
          a.appointment_date::text                                         AS "workDate",
          GREATEST(0, (a.appointment_date - v_now::date))::int             AS "daysLeft",
          'appointment'                                                    AS source,
          CASE
            WHEN a.appointment_type IN ('inizio_lavori','fine_lavori','posa_prova','collaudo','verifica_cantiere')
            THEN 'Appuntamento lavori'
            ELSE 'Appuntamento'
          END                                                             AS "kindLabel"
        FROM appointments a
        LEFT JOIN orders o ON o.id = a.order_id
        LEFT JOIN profiles op ON op.id = o.customer_id
        LEFT JOIN marketing_contacts cp ON cp.id = a.contact_id
        WHERE a.company_id = p_company_id
          AND a.appointment_date BETWEEN v_now::date AND v_forecast_end::date
          AND COALESCE(LOWER(a.status), '') NOT IN ('cancelled', 'canceled', 'annullato', 'annullata')
        ORDER BY "workDate" ASC
        LIMIT 80
      ) w
    ), '[]'::jsonb)
  ) INTO v_weekly_deadlines;

  ------------------------------------------------------------
  -- MONTHLY BALANCE: ora include sia commerciale che reale
  ------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(mb ORDER BY mb.month), '[]'::jsonb)
  INTO v_monthly_balance
  FROM (
    SELECT
      TO_CHAR(m.month, 'Mon YY') AS month,
      -- Commerciale (legacy)
      COALESCE((SELECT SUM(total_amount) FROM orders
                WHERE company_id = p_company_id AND date_trunc('month', created_at) = m.month), 0) AS entrate,
      COALESCE((SELECT SUM(amount) FROM company_costs
                WHERE company_id = p_company_id AND date_trunc('month', due_date::timestamptz) = m.month), 0) AS uscite,
      -- Reale
      COALESCE((SELECT SUM(amount) FROM invoice_payments
                WHERE company_id = p_company_id AND date_trunc('month', payment_date::timestamptz) = m.month), 0) AS "realEntrate",
      COALESCE((SELECT SUM(amount) FROM company_costs
                WHERE company_id = p_company_id AND is_paid = true
                  AND date_trunc('month', paid_date::timestamptz) = m.month), 0) AS "realUscite"
    FROM (SELECT generate_series(
           date_trunc('month', NOW() - INTERVAL '5 months'),
           date_trunc('month', NOW()),
           INTERVAL '1 month') AS month) m
  ) mb;

  ------------------------------------------------------------
  -- REVENUE YTD (invariato)
  ------------------------------------------------------------
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

  ------------------------------------------------------------
  -- AGING RECEIVABLES (invariato)
  ------------------------------------------------------------
  SELECT jsonb_build_object(
    'overdue',   COALESCE(SUM(CASE WHEN expected_date < v_now::date THEN due_amount ELSE 0 END),0),
    'thisWeek',  COALESCE(SUM(CASE WHEN expected_date BETWEEN v_now::date AND v_week_end::date THEN due_amount ELSE 0 END),0),
    'thisMonth', COALESCE(SUM(CASE WHEN expected_date BETWEEN v_week_end::date AND v_month_end::date THEN due_amount ELSE 0 END),0),
    'future',    COALESCE(SUM(CASE WHEN expected_date > v_month_end::date THEN due_amount ELSE 0 END),0)
  ) INTO v_aging
  FROM (
    SELECT expected_date, public.normalized_order_due_amount(
      total_amount, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
      financing_amount, financing_paid, balance_amount, balance_paid
    ) AS due_amount
    FROM orders
    WHERE company_id = p_company_id
  ) normalized_orders
  WHERE due_amount > 0;

  ------------------------------------------------------------
  -- RESULT
  ------------------------------------------------------------
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

COMMENT ON FUNCTION public.get_dashboard_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) IS
  'Dashboard azienda: KPI gestione operativa con residui incasso normalizzati e coerenti col venduto del perimetro.';
