-- 5) Task created
DROP TRIGGER IF EXISTS internal_auto_task_created ON public.tasks;
CREATE TRIGGER internal_auto_task_created
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('task_created', 'task');
