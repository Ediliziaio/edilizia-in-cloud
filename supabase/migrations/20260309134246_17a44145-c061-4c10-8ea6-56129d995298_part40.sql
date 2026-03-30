DROP TRIGGER IF EXISTS trg_internal_auto_ticket_updated ON public.tickets;
CREATE TRIGGER trg_internal_auto_ticket_updated
  AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('ticket_updated', 'ticket');
