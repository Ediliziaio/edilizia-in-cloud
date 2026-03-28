CREATE TRIGGER trg_poi_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
