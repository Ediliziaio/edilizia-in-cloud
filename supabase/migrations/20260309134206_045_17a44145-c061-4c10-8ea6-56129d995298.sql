CREATE TRIGGER trg_internal_auto_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('appointment_created', 'appointment');
