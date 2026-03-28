-- =============================================
-- 2G. TRIGGER updated_at per suppliers e PO
-- =============================================
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
