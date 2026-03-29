-- 8) Warehouse stock low
CREATE TRIGGER internal_auto_warehouse_stock
  AFTER UPDATE ON warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_stock_events();
