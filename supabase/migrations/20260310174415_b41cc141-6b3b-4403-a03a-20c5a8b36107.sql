
-- Fix Gap D: Add OR UPDATE to payment trigger for consistency on payment edits
DROP TRIGGER IF EXISTS trg_update_invoice_on_payment ON public.invoice_payments;
CREATE TRIGGER trg_update_invoice_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_invoice_on_payment();
