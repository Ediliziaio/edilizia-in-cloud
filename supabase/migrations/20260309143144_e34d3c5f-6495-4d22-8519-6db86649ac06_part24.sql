DROP TRIGGER IF EXISTS ia_ticket_events ON public.tickets;
CREATE TRIGGER ia_ticket_events
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_ticket_events();
