-- Updated_at triggers
DROP TRIGGER IF EXISTS update_gcc_updated_at ON public.google_calendar_connections;
CREATE TRIGGER update_gcc_updated_at BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
