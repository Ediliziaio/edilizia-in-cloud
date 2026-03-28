CREATE TRIGGER trg_order_item_auto_deduct BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.trg_auto_deduct_stock();
