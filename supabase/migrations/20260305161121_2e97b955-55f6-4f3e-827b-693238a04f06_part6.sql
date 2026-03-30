-- 6. Trigger on tickets status UPDATE
DROP TRIGGER IF EXISTS trg_ticket_status_notify ON public.tickets;
CREATE TRIGGER trg_ticket_status_notify
AFTER UPDATE OF status ON public.tickets
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_ticket_update();
