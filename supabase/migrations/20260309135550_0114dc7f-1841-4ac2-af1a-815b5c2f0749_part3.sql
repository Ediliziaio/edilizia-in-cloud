CREATE TRIGGER trg_internal_auto_order_status
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_order_status();
