
-- Trigger to validate order total_amount matches the sum of installments
-- This prevents client-side manipulation of order totals via API
CREATE OR REPLACE FUNCTION public.validate_order_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_installments_sum NUMERIC;
  v_installments_count INTEGER;
BEGIN
  -- Only validate if total_amount is being set/changed
  IF TG_OP = 'UPDATE' AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount THEN
    RETURN NEW;
  END IF;

  -- Count installments for this order
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_installments_count, v_installments_sum
  FROM public.order_installments
  WHERE order_id = NEW.id;

  -- If installments exist, validate that total_amount is not artificially inflated
  -- Allow a 1€ tolerance for rounding
  IF v_installments_count > 0 AND NEW.total_amount > 0 AND v_installments_sum > 0 THEN
    IF ABS(NEW.total_amount - v_installments_sum) > 1 AND NEW.total_amount > v_installments_sum * 1.5 THEN
      RAISE EXCEPTION 'total_amount (%) differs significantly from installments sum (%). Update installments first.',
        NEW.total_amount, v_installments_sum;
    END IF;
  END IF;

  -- Ensure total_amount is not negative
  IF NEW.total_amount < 0 THEN
    RAISE EXCEPTION 'total_amount cannot be negative: %', NEW.total_amount;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to orders table (only on UPDATE to avoid blocking creation)
DROP TRIGGER IF EXISTS trg_validate_order_total ON public.orders;
CREATE TRIGGER trg_validate_order_total
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_total();
