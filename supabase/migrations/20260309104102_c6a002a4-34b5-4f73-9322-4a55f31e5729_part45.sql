CREATE TRIGGER trg_recalculate_quote_totals
AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
FOR EACH ROW EXECUTE FUNCTION public.recalculate_quote_totals();
