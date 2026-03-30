DROP TRIGGER IF EXISTS trg_invoice_payments_update ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_update
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION trg_update_paid_amount();
