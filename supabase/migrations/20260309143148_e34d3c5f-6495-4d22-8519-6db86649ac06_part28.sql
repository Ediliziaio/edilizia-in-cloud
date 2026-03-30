-- Warehouse stock
DROP TRIGGER IF EXISTS ia_warehouse_stock ON public.warehouse_stock;
CREATE TRIGGER ia_warehouse_stock
  AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_stock_events();
