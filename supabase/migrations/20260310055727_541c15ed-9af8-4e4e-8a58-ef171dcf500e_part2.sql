DROP TRIGGER IF EXISTS trg_notify_new_ticket ON public.tickets;
CREATE TRIGGER trg_notify_new_ticket
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_ticket();
