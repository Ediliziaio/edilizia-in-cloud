CREATE TRIGGER trg_ticket_message_update_last_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticket_last_message_at();
