-- 5. Trigger on ticket_messages INSERT
CREATE TRIGGER trg_ticket_message_notify
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_update();
