-- 3) Ticket created
DROP TRIGGER IF EXISTS internal_auto_ticket_created ON public.tickets;
CREATE TRIGGER internal_auto_ticket_created
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('ticket_created', 'ticket');
