CREATE TRIGGER trg_update_invoice_on_payment
  AFTER INSERT OR DELETE ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_invoice_on_payment();
