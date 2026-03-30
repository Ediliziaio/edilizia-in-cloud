DROP TRIGGER IF EXISTS ia_task_events ON public.tasks;
CREATE TRIGGER ia_task_events
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_task_events();
