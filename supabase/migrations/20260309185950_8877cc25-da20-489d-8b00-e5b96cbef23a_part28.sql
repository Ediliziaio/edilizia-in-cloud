-- =============================================
-- 2G. TRIGGER updated_at per suppliers e PO
-- =============================================
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
