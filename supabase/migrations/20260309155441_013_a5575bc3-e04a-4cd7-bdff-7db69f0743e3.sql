CREATE TRIGGER trg_invoice_payments_update
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION trg_update_paid_amount();
