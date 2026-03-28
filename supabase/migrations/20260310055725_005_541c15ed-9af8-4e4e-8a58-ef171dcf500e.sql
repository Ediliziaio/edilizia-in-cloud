CREATE TRIGGER trg_notify_ticket_reply
  AFTER INSERT ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_ticket_reply();
