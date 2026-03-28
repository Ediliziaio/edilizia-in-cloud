CREATE TRIGGER update_meta_lead_forms_updated_at BEFORE UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
