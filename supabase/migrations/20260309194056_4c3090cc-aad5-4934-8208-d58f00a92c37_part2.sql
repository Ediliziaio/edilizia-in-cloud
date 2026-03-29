CREATE TRIGGER trg_auto_scadenza_from_invoice
  AFTER INSERT OR UPDATE OF total, due_date, status ON invoices
  FOR EACH ROW
  WHEN (NEW.status NOT IN ('cancelled', 'draft'))
  EXECUTE FUNCTION auto_create_scadenza_from_invoice();
