-- 3. Trigger di sincronizzazione: installments → colonne legacy su orders
CREATE OR REPLACE FUNCTION public.sync_installments_to_order_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_dep1_amount NUMERIC := 0;
  v_dep1_paid BOOLEAN := false;
  v_dep1_paid_date DATE;
  v_dep1_expected_date DATE;
  v_dep2_amount NUMERIC := 0;
  v_dep2_paid BOOLEAN := false;
  v_dep2_paid_date DATE;
  v_dep2_expected_date DATE;
  v_bal_amount NUMERIC := 0;
  v_bal_paid BOOLEAN := false;
  v_bal_paid_date DATE;
  v_bal_expected_date DATE;
  v_fin_amount NUMERIC := 0;
  v_fin_paid BOOLEAN := false;
  v_fin_paid_date DATE;
  v_fin_expected_date DATE;
  v_rec RECORD;
  v_dep_idx INTEGER := 0;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  -- Iterate deposits in position order
  FOR v_rec IN
    SELECT amount, is_paid, paid_date, expected_date
    FROM public.order_installments
    WHERE order_id = v_order_id AND type = 'deposit'
    ORDER BY position
  LOOP
    IF v_dep_idx = 0 THEN
      v_dep1_amount := v_rec.amount;
      v_dep1_paid := v_rec.is_paid;
      v_dep1_paid_date := v_rec.paid_date;
      v_dep1_expected_date := v_rec.expected_date;
    ELSIF v_dep_idx = 1 THEN
      v_dep2_amount := v_rec.amount;
      v_dep2_paid := v_rec.is_paid;
      v_dep2_paid_date := v_rec.paid_date;
      v_dep2_expected_date := v_rec.expected_date;
    END IF;
    v_dep_idx := v_dep_idx + 1;
  END LOOP;

  -- Balance
  SELECT amount, is_paid, paid_date, expected_date
  INTO v_bal_amount, v_bal_paid, v_bal_paid_date, v_bal_expected_date
  FROM public.order_installments
  WHERE order_id = v_order_id AND type = 'balance'
  ORDER BY position LIMIT 1;

  -- Financing
  SELECT amount, is_paid, paid_date, expected_date
  INTO v_fin_amount, v_fin_paid, v_fin_paid_date, v_fin_expected_date
  FROM public.order_installments
  WHERE order_id = v_order_id AND type = 'financing'
  ORDER BY position LIMIT 1;

  -- Update legacy columns
  UPDATE public.orders SET
    deposit_amount = COALESCE(v_dep1_amount, 0),
    deposit_paid = COALESCE(v_dep1_paid, false),
    deposit_paid_date = v_dep1_paid_date,
    deposit_expected_date = v_dep1_expected_date,
    deposit_2_amount = COALESCE(v_dep2_amount, 0),
    deposit_2_paid = COALESCE(v_dep2_paid, false),
    deposit_2_paid_date = v_dep2_paid_date,
    deposit_2_expected_date = v_dep2_expected_date,
    balance_amount = COALESCE(v_bal_amount, 0),
    balance_paid = COALESCE(v_bal_paid, false),
    balance_paid_date = v_bal_paid_date,
    balance_expected_date = v_bal_expected_date,
    financing_amount = COALESCE(v_fin_amount, 0),
    financing_paid = COALESCE(v_fin_paid, false),
    financing_paid_date = v_fin_paid_date,
    financing_expected_date = v_fin_expected_date
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
