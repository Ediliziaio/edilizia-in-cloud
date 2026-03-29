CREATE TRIGGER trg_internal_auto_order_updated
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('order_updated', 'order');
