-- Attach missing triggers for internal automations

CREATE OR REPLACE TRIGGER internal_auto_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('order_created', 'order');
