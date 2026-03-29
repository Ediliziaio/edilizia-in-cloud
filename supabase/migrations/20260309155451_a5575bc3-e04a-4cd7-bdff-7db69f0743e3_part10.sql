CREATE TRIGGER trg_invoice_lines_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_invoice();
