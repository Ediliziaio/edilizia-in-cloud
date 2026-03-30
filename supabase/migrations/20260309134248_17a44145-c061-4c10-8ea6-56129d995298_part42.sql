DROP TRIGGER IF EXISTS trg_internal_auto_task_updated ON public.tasks;
CREATE TRIGGER trg_internal_auto_task_updated
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('task_updated', 'task');
