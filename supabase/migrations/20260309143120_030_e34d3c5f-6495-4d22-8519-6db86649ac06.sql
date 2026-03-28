-- Appointments
CREATE TRIGGER ia_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('appointment_created', 'appointment');
