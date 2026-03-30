DROP TRIGGER IF EXISTS trg_auto_oda_number ON public.purchase_orders;
CREATE TRIGGER trg_auto_oda_number
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_oda_number();
