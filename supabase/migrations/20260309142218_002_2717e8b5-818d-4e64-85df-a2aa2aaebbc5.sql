CREATE OR REPLACE TRIGGER internal_auto_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('ticket_created', 'ticket');
