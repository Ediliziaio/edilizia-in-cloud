DROP TRIGGER IF EXISTS trg_internal_auto_ticket_events ON public.tickets;
CREATE TRIGGER trg_internal_auto_ticket_events
AFTER UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_ticket_events();
