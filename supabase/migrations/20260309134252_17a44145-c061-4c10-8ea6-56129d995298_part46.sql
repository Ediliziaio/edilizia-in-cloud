DROP TRIGGER IF EXISTS trg_internal_auto_appointment_updated ON public.appointments;
CREATE TRIGGER trg_internal_auto_appointment_updated
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('appointment_updated', 'appointment');
