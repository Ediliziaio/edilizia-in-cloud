CREATE OR REPLACE TRIGGER internal_auto_order_status
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_order_status();
