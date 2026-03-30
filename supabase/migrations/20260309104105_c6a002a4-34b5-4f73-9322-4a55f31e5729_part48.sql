DROP TRIGGER IF EXISTS trg_qpm_updated_at ON public.quote_pdf_materials;
CREATE TRIGGER trg_qpm_updated_at
BEFORE UPDATE ON public.quote_pdf_materials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
