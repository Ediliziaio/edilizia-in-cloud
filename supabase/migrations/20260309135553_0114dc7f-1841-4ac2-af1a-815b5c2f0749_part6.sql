CREATE TRIGGER trg_internal_auto_ticket_events
AFTER UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_ticket_events();
