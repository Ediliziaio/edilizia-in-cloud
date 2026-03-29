CREATE TRIGGER trg_internal_auto_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('ticket_created', 'ticket');
