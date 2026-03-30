DROP TRIGGER IF EXISTS trg_internal_auto_task_created ON public.tasks;
CREATE TRIGGER trg_internal_auto_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('task_created', 'task');
