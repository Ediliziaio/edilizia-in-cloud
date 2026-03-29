-- 3) Ticket created
CREATE TRIGGER internal_auto_ticket_created
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('ticket_created', 'ticket');
