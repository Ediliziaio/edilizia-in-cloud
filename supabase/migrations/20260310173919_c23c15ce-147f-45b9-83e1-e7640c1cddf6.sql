
-- Fix #3: Trigger to keep invoices.paid_amount and status consistent with invoice_payments
CREATE OR REPLACE FUNCTION public.fn_update_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_total_paid numeric;
  v_invoice_total numeric;
  v_last_payment_date date;
BEGIN
  -- Determine which invoice was affected
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Calculate total paid and last payment date
  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
  INTO v_total_paid, v_last_payment_date
  FROM public.invoice_payments
  WHERE invoice_id = v_invoice_id;

  -- Get invoice total
  SELECT total INTO v_invoice_total
  FROM public.invoices
  WHERE id = v_invoice_id;

  -- Update invoice paid_amount and conditionally status
  UPDATE public.invoices
  SET 
    paid_amount = v_total_paid,
    payment_date = v_last_payment_date,
    updated_at = now()
  WHERE id = v_invoice_id;

  -- If fully paid, set status to 'paid' (only if not already cancelled)
  IF v_total_paid >= v_invoice_total THEN
    UPDATE public.invoices
    SET status = 'paid'
    WHERE id = v_invoice_id AND status != 'cancelled';
  ELSIF v_total_paid = 0 THEN
    -- If no payments remain, revert to previous non-paid status (keep current if not 'paid')
    UPDATE public.invoices
    SET status = 'issued'
    WHERE id = v_invoice_id AND status = 'paid';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on invoice_payments
DROP TRIGGER IF EXISTS trg_update_invoice_on_payment ON public.invoice_payments;
CREATE TRIGGER trg_update_invoice_on_payment
  AFTER INSERT OR DELETE ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_invoice_on_payment();
