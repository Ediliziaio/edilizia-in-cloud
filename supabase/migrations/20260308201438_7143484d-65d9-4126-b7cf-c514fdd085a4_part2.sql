CREATE TRIGGER trg_validate_order_total
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_total();
