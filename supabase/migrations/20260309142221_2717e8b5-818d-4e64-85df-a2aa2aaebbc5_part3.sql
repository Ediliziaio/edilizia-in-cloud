CREATE OR REPLACE TRIGGER internal_auto_ticket_status
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_ticket_events();
