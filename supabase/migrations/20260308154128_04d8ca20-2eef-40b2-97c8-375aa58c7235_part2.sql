DROP TRIGGER IF EXISTS trg_call_registered_automation ON public.call_logs;
CREATE TRIGGER trg_call_registered_automation
AFTER INSERT ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.fire_call_registered_automation();
