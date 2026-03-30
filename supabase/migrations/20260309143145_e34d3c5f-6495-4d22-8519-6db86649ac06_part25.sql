-- Tasks
DROP TRIGGER IF EXISTS ia_task_created ON public.tasks;
CREATE TRIGGER ia_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('task_created', 'task');
