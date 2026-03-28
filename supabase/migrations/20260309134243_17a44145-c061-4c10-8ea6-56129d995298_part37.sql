-- DB Triggers (no WHEN clause referencing enum status directly)
CREATE TRIGGER trg_internal_auto_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('order_created', 'order');
