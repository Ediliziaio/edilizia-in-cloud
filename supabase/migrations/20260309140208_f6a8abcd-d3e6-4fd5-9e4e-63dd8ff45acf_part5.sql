-- 4) Ticket status / assigned changed
DROP TRIGGER IF EXISTS internal_auto_ticket_events ON public.tickets;
CREATE TRIGGER internal_auto_ticket_events
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_ticket_events();
