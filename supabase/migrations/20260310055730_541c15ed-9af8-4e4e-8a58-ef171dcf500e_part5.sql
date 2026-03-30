DROP TRIGGER IF EXISTS trg_notify_ticket_reply ON public.ticket_messages;
CREATE TRIGGER trg_notify_ticket_reply
  AFTER INSERT ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_ticket_reply();
