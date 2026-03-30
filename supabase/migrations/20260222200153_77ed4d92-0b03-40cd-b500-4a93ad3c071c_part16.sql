-- Trigger for updated_at on marketing_calendar_preferences
DROP TRIGGER IF EXISTS update_marketing_calendar_preferences_updated_at ON public.marketing_calendar_preferences;
CREATE TRIGGER update_marketing_calendar_preferences_updated_at
  BEFORE UPDATE ON public.marketing_calendar_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
