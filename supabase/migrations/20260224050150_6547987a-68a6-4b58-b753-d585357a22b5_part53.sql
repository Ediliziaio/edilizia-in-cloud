DROP TRIGGER IF EXISTS update_integration_field_mappings_updated_at ON public.integration_field_mappings;
CREATE TRIGGER update_integration_field_mappings_updated_at BEFORE UPDATE ON public.integration_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
