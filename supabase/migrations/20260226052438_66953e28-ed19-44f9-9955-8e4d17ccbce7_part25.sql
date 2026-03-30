DROP TRIGGER IF EXISTS update_gcs_updated_at ON public.google_calendar_settings;
CREATE TRIGGER update_gcs_updated_at BEFORE UPDATE ON public.google_calendar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
