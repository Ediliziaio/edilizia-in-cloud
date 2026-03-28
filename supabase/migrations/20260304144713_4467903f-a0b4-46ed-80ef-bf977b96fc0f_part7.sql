CREATE TRIGGER trg_appointment_automation
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();
