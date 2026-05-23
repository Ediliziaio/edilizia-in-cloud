-- Commission engine for order_salespeople.
-- Keeps commission_amount aligned with order totals, collected installments and fixed-only salespeople.

CREATE OR REPLACE FUNCTION public.calculate_order_salesperson_commission(
  p_order_id UUID,
  p_salesperson_id UUID,
  p_commission_type TEXT,
  p_commission_value NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_salesperson RECORD;
  v_vat_rate NUMERIC;
  v_collected_gross NUMERIC := 0;
  v_collected_net NUMERIC := 0;
  v_installment_count INTEGER := 0;
BEGIN
  SELECT
    id, company_id, total_amount, vat_rate,
    deposit_amount, deposit_paid,
    deposit_2_amount, deposit_2_paid,
    balance_amount, balance_paid,
    financing_amount, financing_paid,
    financing_cost
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  SELECT id, company_id, compensation_mode
  INTO v_salesperson
  FROM public.salespeople
  WHERE id = p_salesperson_id;

  IF v_salesperson.id IS NULL THEN
    RAISE EXCEPTION 'salesperson_not_found';
  END IF;

  IF v_salesperson.company_id <> v_order.company_id THEN
    RAISE EXCEPTION 'salesperson_company_mismatch';
  END IF;

  IF COALESCE(v_salesperson.compensation_mode, 'only_commission') = 'fixed_only' THEN
    RETURN 0;
  END IF;

  IF p_commission_type = 'fixed' THEN
    RETURN ROUND(COALESCE(p_commission_value, 0), 2);
  END IF;

  IF p_commission_type = 'percentage_sold' THEN
    RETURN ROUND(COALESCE(v_order.total_amount, 0) * COALESCE(p_commission_value, 0) / 100, 2);
  END IF;

  IF p_commission_type = 'percentage_collected' THEN
    v_vat_rate := COALESCE(v_order.vat_rate, 22);

    SELECT
      COUNT(*),
      COALESCE(SUM(
        CASE
          WHEN is_paid = true AND type <> 'financing' THEN COALESCE(amount, 0)
          ELSE 0
        END
      ), 0)
    INTO v_installment_count, v_collected_gross
    FROM public.order_installments
    WHERE order_id = p_order_id;

    IF v_installment_count = 0 THEN
      v_collected_gross :=
        CASE WHEN COALESCE(v_order.deposit_paid, false) THEN COALESCE(v_order.deposit_amount, 0) ELSE 0 END
        + CASE WHEN COALESCE(v_order.deposit_2_paid, false) THEN COALESCE(v_order.deposit_2_amount, 0) ELSE 0 END
        + CASE WHEN COALESCE(v_order.balance_paid, false) THEN COALESCE(v_order.balance_amount, 0) ELSE 0 END;
    END IF;

    v_collected_net := v_collected_gross / (1 + v_vat_rate / 100);
    RETURN ROUND(v_collected_net * COALESCE(p_commission_value, 0) / 100, 2);
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_salesperson_commission_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.deduction_amount := COALESCE(NEW.deduction_amount, 0);
  NEW.commission_amount := public.calculate_order_salesperson_commission(
    NEW.order_id,
    NEW.salesperson_id,
    NEW.commission_type,
    NEW.commission_value
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_salesperson_commission_amount ON public.order_salespeople;
CREATE TRIGGER trg_set_order_salesperson_commission_amount
BEFORE INSERT OR UPDATE OF order_id, salesperson_id, commission_type, commission_value
ON public.order_salespeople
FOR EACH ROW
EXECUTE FUNCTION public.set_order_salesperson_commission_amount();

CREATE OR REPLACE FUNCTION public.refresh_order_salespeople_commissions(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_salespeople os
  SET commission_amount = public.calculate_order_salesperson_commission(
    os.order_id,
    os.salesperson_id,
    os.commission_type,
    os.commission_value
  )
  WHERE os.order_id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_order_salespeople_commissions_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_order_salespeople_commissions(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_order_salespeople_commissions_from_order ON public.orders;
CREATE TRIGGER trg_refresh_order_salespeople_commissions_from_order
AFTER UPDATE OF total_amount, vat_rate, deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
  balance_amount, balance_paid, financing_amount, financing_paid, financing_cost
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.refresh_order_salespeople_commissions_from_order();

CREATE OR REPLACE FUNCTION public.refresh_order_salespeople_commissions_from_installment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;
  PERFORM public.refresh_order_salespeople_commissions(v_order_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_order_salespeople_commissions_from_installment ON public.order_installments;
CREATE TRIGGER trg_refresh_order_salespeople_commissions_from_installment
AFTER INSERT OR UPDATE OF amount, is_paid, type OR DELETE
ON public.order_installments
FOR EACH ROW
EXECUTE FUNCTION public.refresh_order_salespeople_commissions_from_installment();

-- Backfill existing rows once the canonical engine is installed.
-- This fixes historical records created by older client-side calculations
-- and makes commission_amount the authoritative value for reporting.
UPDATE public.order_salespeople os
SET commission_amount = public.calculate_order_salesperson_commission(
  os.order_id,
  os.salesperson_id,
  os.commission_type,
  os.commission_value
);
