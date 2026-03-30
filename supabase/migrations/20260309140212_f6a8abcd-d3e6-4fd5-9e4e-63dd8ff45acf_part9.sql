-- 8) Warehouse stock low
DROP TRIGGER IF EXISTS internal_auto_warehouse_stock ON public.warehouse_stock;
CREATE TRIGGER internal_auto_warehouse_stock
  AFTER UPDATE ON warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_stock_events();
