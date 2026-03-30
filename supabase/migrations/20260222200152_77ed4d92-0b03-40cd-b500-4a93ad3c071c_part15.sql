-- Trigger for updated_at on marketing_calendars
DROP TRIGGER IF EXISTS update_marketing_calendars_updated_at ON public.marketing_calendars;
CREATE TRIGGER update_marketing_calendars_updated_at
  BEFORE UPDATE ON public.marketing_calendars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
