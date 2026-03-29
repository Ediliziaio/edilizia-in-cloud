CREATE TRIGGER trg_internal_auto_stock_events
AFTER UPDATE ON warehouse_stock
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_stock_events();
