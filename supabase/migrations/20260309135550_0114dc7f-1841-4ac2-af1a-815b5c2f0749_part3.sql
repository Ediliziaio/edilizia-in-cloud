DROP TRIGGER IF EXISTS trg_internal_auto_order_status ON public.orders;
CREATE TRIGGER trg_internal_auto_order_status
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_order_status();
