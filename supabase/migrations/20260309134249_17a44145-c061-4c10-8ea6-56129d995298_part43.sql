CREATE TRIGGER trg_internal_auto_stock_updated
  AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('stock_updated', 'warehouse_stock');
