-- Tickets
DROP TRIGGER IF EXISTS ia_ticket_created ON public.tickets;
CREATE TRIGGER ia_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('ticket_created', 'ticket');
