CREATE TRIGGER ia_appointment_updated
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_appointment_events();
