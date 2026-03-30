-- 2) Order status changed (UPDATE)
DROP TRIGGER IF EXISTS internal_auto_order_status ON public.orders;
CREATE TRIGGER internal_auto_order_status
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_order_status();
