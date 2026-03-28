CREATE TRIGGER trg_internal_auto_task_updated
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('task_updated', 'task');
