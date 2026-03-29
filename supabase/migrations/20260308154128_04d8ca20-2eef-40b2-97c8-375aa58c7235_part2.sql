CREATE TRIGGER trg_call_registered_automation
AFTER INSERT ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.fire_call_registered_automation();
