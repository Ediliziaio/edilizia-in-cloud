DROP TRIGGER IF EXISTS update_gcem_updated_at ON public.google_calendar_event_map;
CREATE TRIGGER update_gcem_updated_at BEFORE UPDATE ON public.google_calendar_event_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
