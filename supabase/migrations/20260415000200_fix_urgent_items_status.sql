-- ════════════════════════════════════════════════════════════════
-- FIX: urgent items usa order_items.status (non la colonna inesistente in_stock)
-- ════════════════════════════════════════════════════════════════
-- Rimpiazza get_dashboard_kpis con la versione corretta: la query urgentItems
-- filtrava per COALESCE(oi.in_stock, false) = false, ma quella colonna non
-- esiste. Usa invece oi.status IN ('da_ordinare','ordinato','in_arrivo') che
-- rappresenta articoli non ancora ricevuti (coerente con stock_reservation_trigger).
--
-- Per il resto la funzione è identica a 20260415000100_dashboard_real_cashflow.sql
-- ════════════════════════════════════════════════════════════════
-- Original header:
-- Aggiorna get_dashboard_kpis aggiungendo metriche di cassa REALI
-- calcolate da:
--   • invoice_payments.payment_date  → incassi veri
--   • company_costs.is_paid=true     → pagamenti veri
--   • orders.balance_amount          → crediti da incassare per forecast
--
-- I campi esistenti (thisMonthIncome, thisMonthOutflow, netCashFlow, nextMonth)
-- sono mantenuti invariati per compatibilità: rappresentano ancora il dato
-- commerciale "ordinato vs pianificato".
--
-- NUOVI campi nella struttura cashFlow:
--   • realIncome        — incassi reali del mese (da invoice_payments)
--   • realOutflow       — pagamenti reali del mese (company_costs is_paid)
--   • realNet           — saldo di cassa reale del mese
--   • forecastNext30d   — forecast 30 giorni: crediti attesi - costi pianificati
--   • hasRealData       — bool: true se l'azienda usa invoice_payments o
--                          registra pagamenti in company_costs
--
-- NUOVI campi in monthlyBalance:
--   • realEntrate       — incassi reali per mese
--   • realUscite        — pagamenti reali per mese
-- ════════════════════════════════════════════════════════════════

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
  SELECT COALESCE(SUM(COALESCE(balance_amount, 0)), 0) INTO v_forecast_in
  FROM orders
  WHERE company_id = p_company_id
    AND COALESCE(balance_amount, 0) > 0
    AND expected_date IS NOT NULL
    AND expected_date BETWEEN v_now::date AND v_forecast_end::date;

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
    'pendingRevenue',     COALESCE(SUM(CASE WHEN COALESCE(o.balance_amount,0) > 0 THEN o.balance_amount ELSE 0 END), 0),
    'pendingOrdersCount', COUNT(CASE WHEN COALESCE(o.balance_amount,0) > 0 THEN 1 END)::INT
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
             (SELECT COALESCE(SUM(balance_amount), 0) FROM orders
              WHERE company_id = p_company_id
                AND expected_date < v_now::date
                AND COALESCE(balance_amount, 0) > 0), 'FM999G999G990D00 €'
           ) AS message
    WHERE EXISTS (
      SELECT 1 FROM orders
      WHERE company_id = p_company_id
        AND expected_date < v_now::date
        AND COALESCE(balance_amount, 0) > 1000
    )
  ) fa;

  ------------------------------------------------------------
  -- WEEKLY DEADLINES (invariato nella forma, usa dati corretti)
  ------------------------------------------------------------
  SELECT jsonb_build_object(
    'receivables', COALESCE((
      SELECT jsonb_agg(r)
      FROM (
        SELECT
          o.description                          AS "orderDescription",
          COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS "customerName",
          COALESCE(o.balance_amount, 0)          AS amount,
          o.expected_date::text                  AS "expectedDate",
          GREATEST(0, (o.expected_date - v_now::date))::int AS "daysLeft"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.expected_date IS NOT NULL
          AND o.expected_date BETWEEN v_now::date AND v_week_end::date
          AND COALESCE(o.balance_amount, 0) > 0
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
          AND due_date BETWEEN v_now::date AND v_week_end::date
        ORDER BY due_date ASC
        LIMIT 10
      ) c
    ), '[]'::jsonb),
    'upcomingWorks', COALESCE((
      SELECT jsonb_agg(w)
      FROM (
        SELECT
          o.description                                                    AS "orderCode",
          COALESCE(p.first_name || ' ' || p.last_name, 'Cliente')         AS "customerName",
          o.expected_date::text                                            AS "workDate",
          GREATEST(0, (o.expected_date - v_now::date))::int                AS "daysLeft"
        FROM orders o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.expected_date IS NOT NULL
          AND o.expected_date BETWEEN v_now::date AND v_week_end::date
        ORDER BY o.expected_date ASC
        LIMIT 10
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
    'overdue',   COALESCE(SUM(CASE WHEN expected_date < v_now::date                              AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0),
    'thisWeek',  COALESCE(SUM(CASE WHEN expected_date BETWEEN v_now::date AND v_week_end::date   AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0),
    'thisMonth', COALESCE(SUM(CASE WHEN expected_date BETWEEN v_week_end::date AND v_month_end::date AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0),
    'future',    COALESCE(SUM(CASE WHEN expected_date > v_month_end::date                        AND COALESCE(balance_amount,0)>0 THEN balance_amount ELSE 0 END),0)
  ) INTO v_aging
  FROM orders
  WHERE company_id = p_company_id;

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
  'Dashboard azienda. cashFlow contiene sia metriche commerciali legacy (thisMonthIncome/thisMonthOutflow/netCashFlow/nextMonth = ordinato vs pianificato) sia metriche di cassa REALI (realIncome/realOutflow/realNet/forecastNext30d da invoice_payments + company_costs.is_paid + orders.balance_amount). Il flag hasRealData indica se l''azienda ha alimentato i dati reali.';
