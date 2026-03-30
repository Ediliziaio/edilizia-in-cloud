DROP TRIGGER IF EXISTS trg_recalc_po_totals ON public.purchase_order_items;
CREATE TRIGGER trg_recalc_po_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_purchase_order_totals();
