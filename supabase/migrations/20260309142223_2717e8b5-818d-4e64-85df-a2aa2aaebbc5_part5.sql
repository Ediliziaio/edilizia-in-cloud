CREATE OR REPLACE TRIGGER internal_auto_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_task_events();
