CREATE OR REPLACE TRIGGER internal_auto_warehouse_low
  AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_stock_events();
