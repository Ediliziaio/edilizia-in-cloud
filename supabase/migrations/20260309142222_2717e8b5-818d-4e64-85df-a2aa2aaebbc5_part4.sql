CREATE OR REPLACE TRIGGER internal_auto_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('task_created', 'task');
