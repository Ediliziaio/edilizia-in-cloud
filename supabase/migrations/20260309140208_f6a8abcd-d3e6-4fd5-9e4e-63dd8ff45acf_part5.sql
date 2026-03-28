-- 4) Ticket status / assigned changed
CREATE TRIGGER internal_auto_ticket_events
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_ticket_events();
