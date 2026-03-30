
CREATE OR REPLACE FUNCTION public.get_cashflow_summary(
  p_company_id UUID,
  p_months_ahead INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now          DATE := CURRENT_DATE;
  v_month_start  DATE := date_trunc('month', CURRENT_DATE)::date;
  v_month_end    DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;
  v_next_m_start DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;
  v_next_m_end   DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '2 months')::date;
  v_3m_end       DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '3 months')::date;

  -- Prima Nota saldo
  v_pn_entrate   NUMERIC := 0;
  v_pn_uscite    NUMERIC := 0;
  v_pn_count     BIGINT  := 0;

  -- Installments (income) aggregates
  v_inc_this     NUMERIC := 0;
  v_inc_next     NUMERIC := 0;
  v_inc_3m       NUMERIC := 0;
  v_inc_total    NUMERIC := 0;
  v_inc_count_this INT := 0;
  v_inc_count_total INT := 0;

  -- External teams (expense) aggregates
  v_ext_this     NUMERIC := 0;
  v_ext_next     NUMERIC := 0;
  v_ext_3m       NUMERIC := 0;
  v_ext_total    NUMERIC := 0;
  v_ext_count_this INT := 0;
  v_ext_count_total INT := 0;

  -- Commissions aggregates
  v_com_this     NUMERIC := 0;
  v_com_next     NUMERIC := 0;
  v_com_3m       NUMERIC := 0;
  v_com_total    NUMERIC := 0;
  v_com_count_this INT := 0;
  v_com_count_total INT := 0;

  -- Company costs aggregates
  v_cc_this      NUMERIC := 0;
  v_cc_next      NUMERIC := 0;
  v_cc_3m        NUMERIC := 0;
  v_cc_total     NUMERIC := 0;
  v_cc_count_this INT := 0;
  v_cc_count_total INT := 0;

  -- Supplier payments aggregates
  v_sup_this     NUMERIC := 0;
  v_sup_next     NUMERIC := 0;
  v_sup_3m       NUMERIC := 0;
  v_sup_total    NUMERIC := 0;
  v_sup_count_this INT := 0;
  v_sup_count_total INT := 0;

  -- Monthly forecast
  v_monthly_forecast JSONB := '[]'::jsonb;
  v_m_start      DATE;
  v_m_end        DATE;
  v_m_income     NUMERIC;
  v_m_expense    NUMERIC;
BEGIN
  -- 1) Prima Nota saldo
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'entrata' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'uscita' THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_pn_entrate, v_pn_uscite, v_pn_count
  FROM prima_nota_entries
  WHERE company_id = p_company_id;

  -- 2) Unpaid installments (income)
  SELECT
    COALESCE(SUM(CASE WHEN oi.expected_date >= v_month_start AND oi.expected_date < v_month_end THEN oi.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN oi.expected_date >= v_next_m_start AND oi.expected_date < v_next_m_end THEN oi.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN oi.expected_date >= v_month_start AND oi.expected_date < v_3m_end THEN oi.amount ELSE 0 END), 0),
    COALESCE(SUM(oi.amount), 0),
    COUNT(CASE WHEN oi.expected_date >= v_month_start AND oi.expected_date < v_month_end THEN 1 END)::INT,
    COUNT(*)::INT
  INTO v_inc_this, v_inc_next, v_inc_3m, v_inc_total, v_inc_count_this, v_inc_count_total
  FROM order_installments oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.company_id = p_company_id
    AND oi.is_paid = false
    AND oi.amount > 0;

  -- 3) Unpaid external teams (expense)
  SELECT
    COALESCE(SUM(CASE WHEN oet.payment_date >= v_month_start AND oet.payment_date < v_month_end THEN oet.total_cost ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN oet.payment_date >= v_next_m_start AND oet.payment_date < v_next_m_end THEN oet.total_cost ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN oet.payment_date >= v_month_start AND oet.payment_date < v_3m_end THEN oet.total_cost ELSE 0 END), 0),
    COALESCE(SUM(oet.total_cost), 0),
    COUNT(CASE WHEN oet.payment_date >= v_month_start AND oet.payment_date < v_month_end THEN 1 END)::INT,
    COUNT(*)::INT
  INTO v_ext_this, v_ext_next, v_ext_3m, v_ext_total, v_ext_count_this, v_ext_count_total
  FROM order_external_teams oet
  JOIN orders o ON o.id = oet.order_id
  WHERE o.company_id = p_company_id
    AND oet.is_paid = false;

  -- 4) Unpaid commissions
  SELECT
    COALESCE(SUM(CASE WHEN os.payment_expected_date >= v_month_start AND os.payment_expected_date < v_month_end THEN os.commission_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN os.payment_expected_date >= v_next_m_start AND os.payment_expected_date < v_next_m_end THEN os.commission_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN os.payment_expected_date >= v_month_start AND os.payment_expected_date < v_3m_end THEN os.commission_amount ELSE 0 END), 0),
    COALESCE(SUM(os.commission_amount), 0),
    COUNT(CASE WHEN os.payment_expected_date >= v_month_start AND os.payment_expected_date < v_month_end THEN 1 END)::INT,
    COUNT(*)::INT
  INTO v_com_this, v_com_next, v_com_3m, v_com_total, v_com_count_this, v_com_count_total
  FROM order_salespeople os
  JOIN orders o ON o.id = os.order_id
  WHERE o.company_id = p_company_id
    AND os.is_paid = false;

  -- 5) Unpaid company costs
  SELECT
    COALESCE(SUM(CASE WHEN cc.due_date >= v_month_start AND cc.due_date < v_month_end THEN cc.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cc.due_date >= v_next_m_start AND cc.due_date < v_next_m_end THEN cc.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cc.due_date >= v_month_start AND cc.due_date < v_3m_end THEN cc.amount ELSE 0 END), 0),
    COALESCE(SUM(cc.amount), 0),
    COUNT(CASE WHEN cc.due_date >= v_month_start AND cc.due_date < v_month_end THEN 1 END)::INT,
    COUNT(*)::INT
  INTO v_cc_this, v_cc_next, v_cc_3m, v_cc_total, v_cc_count_this, v_cc_count_total
  FROM company_costs cc
  WHERE cc.company_id = p_company_id
    AND cc.is_paid = false;

  -- 6) Unpaid supplier payments (order_items with supplier, excluding stock)
  --    Simplified: sum of (purchase_price * quantity) for unpaid items
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(it.balance_expected_date, it.deposit_expected_date) >= v_month_start
                       AND COALESCE(it.balance_expected_date, it.deposit_expected_date) < v_month_end
                  THEN (COALESCE(it.purchase_price,0) * COALESCE(it.quantity,1)) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(it.balance_expected_date, it.deposit_expected_date) >= v_next_m_start
                       AND COALESCE(it.balance_expected_date, it.deposit_expected_date) < v_next_m_end
                  THEN (COALESCE(it.purchase_price,0) * COALESCE(it.quantity,1)) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(it.balance_expected_date, it.deposit_expected_date) >= v_month_start
                       AND COALESCE(it.balance_expected_date, it.deposit_expected_date) < v_3m_end
                  THEN (COALESCE(it.purchase_price,0) * COALESCE(it.quantity,1)) ELSE 0 END), 0),
    COALESCE(SUM(COALESCE(it.purchase_price,0) * COALESCE(it.quantity,1)), 0),
    COUNT(CASE WHEN COALESCE(it.balance_expected_date, it.deposit_expected_date) >= v_month_start
               AND COALESCE(it.balance_expected_date, it.deposit_expected_date) < v_month_end THEN 1 END)::INT,
    COUNT(*)::INT
  INTO v_sup_this, v_sup_next, v_sup_3m, v_sup_total, v_sup_count_this, v_sup_count_total
  FROM order_items it
  JOIN orders o ON o.id = it.order_id
  WHERE o.company_id = p_company_id
    AND it.supplier_id IS NOT NULL
    AND it.stock_item_id IS NULL
    AND it.is_paid = false;

  -- 7) Monthly forecast for next N months
  FOR i IN 0..p_months_ahead-1 LOOP
    v_m_start := (date_trunc('month', CURRENT_DATE) + (i || ' months')::INTERVAL)::date;
    v_m_end   := (v_m_start + INTERVAL '1 month')::date;

    SELECT COALESCE(SUM(oi.amount), 0)
    INTO v_m_income
    FROM order_installments oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.company_id = p_company_id
      AND oi.is_paid = false
      AND oi.amount > 0
      AND oi.expected_date >= v_m_start AND oi.expected_date < v_m_end;

    SELECT COALESCE(
      (SELECT SUM(oet.total_cost) FROM order_external_teams oet JOIN orders o2 ON o2.id = oet.order_id
       WHERE o2.company_id = p_company_id AND oet.is_paid = false AND oet.payment_date >= v_m_start AND oet.payment_date < v_m_end), 0)
    + COALESCE(
      (SELECT SUM(os2.commission_amount) FROM order_salespeople os2 JOIN orders o3 ON o3.id = os2.order_id
       WHERE o3.company_id = p_company_id AND os2.is_paid = false AND os2.payment_expected_date >= v_m_start AND os2.payment_expected_date < v_m_end), 0)
    + COALESCE(
      (SELECT SUM(cc2.amount) FROM company_costs cc2
       WHERE cc2.company_id = p_company_id AND cc2.is_paid = false AND cc2.due_date >= v_m_start AND cc2.due_date < v_m_end), 0)
    + COALESCE(
      (SELECT SUM(COALESCE(it2.purchase_price,0) * COALESCE(it2.quantity,1)) FROM order_items it2 JOIN orders o4 ON o4.id = it2.order_id
       WHERE o4.company_id = p_company_id AND it2.supplier_id IS NOT NULL AND it2.stock_item_id IS NULL AND it2.is_paid = false
       AND COALESCE(it2.balance_expected_date, it2.deposit_expected_date) >= v_m_start
       AND COALESCE(it2.balance_expected_date, it2.deposit_expected_date) < v_m_end), 0)
    INTO v_m_expense;

    v_monthly_forecast := v_monthly_forecast || jsonb_build_object(
      'month', to_char(v_m_start, 'YYYY-MM'),
      'monthLabel', to_char(v_m_start, 'Mon YY'),
      'income', v_m_income,
      'expense', v_m_expense,
      'net', v_m_income - v_m_expense
    );
  END LOOP;

  RETURN jsonb_build_object(
    'primaNota', jsonb_build_object(
      'entrate', v_pn_entrate,
      'uscite', v_pn_uscite,
      'saldo', v_pn_entrate - v_pn_uscite,
      'entryCount', v_pn_count
    ),
    'thisMonth', jsonb_build_object(
      'income', v_inc_this,
      'expenses', v_ext_this + v_com_this + v_cc_this + v_sup_this,
      'net', v_inc_this - (v_ext_this + v_com_this + v_cc_this + v_sup_this),
      'incomeCount', v_inc_count_this,
      'expensesCount', v_ext_count_this + v_com_count_this + v_cc_count_this + v_sup_count_this
    ),
    'nextMonth', jsonb_build_object(
      'income', v_inc_next,
      'expenses', v_ext_next + v_com_next + v_cc_next + v_sup_next,
      'net', v_inc_next - (v_ext_next + v_com_next + v_cc_next + v_sup_next)
    ),
    'next3Months', jsonb_build_object(
      'income', v_inc_3m,
      'expenses', v_ext_3m + v_com_3m + v_cc_3m + v_sup_3m,
      'net', v_inc_3m - (v_ext_3m + v_com_3m + v_cc_3m + v_sup_3m)
    ),
    'total', jsonb_build_object(
      'income', v_inc_total,
      'expenses', v_ext_total + v_com_total + v_cc_total + v_sup_total,
      'net', v_inc_total - (v_ext_total + v_com_total + v_cc_total + v_sup_total),
      'incomeCount', v_inc_count_total,
      'expensesCount', v_ext_count_total + v_com_count_total + v_cc_count_total + v_sup_count_total,
      'commissionsTotal', v_com_total,
      'costsTotal', v_cc_total,
      'supplierPaymentsTotal', v_sup_total
    ),
    'monthlyForecast', v_monthly_forecast
  );
END;
$$;
