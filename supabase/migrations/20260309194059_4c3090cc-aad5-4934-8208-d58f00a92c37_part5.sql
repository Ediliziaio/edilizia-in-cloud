DROP TRIGGER IF EXISTS trg_auto_reconcile_invoice ON public.invoices;
CREATE TRIGGER trg_auto_reconcile_invoice
  AFTER UPDATE OF status, paid_amount ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_reconcile_invoice_payment();
