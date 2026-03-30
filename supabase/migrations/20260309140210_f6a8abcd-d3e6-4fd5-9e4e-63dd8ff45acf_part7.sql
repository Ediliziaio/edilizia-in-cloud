-- 6) Task completed / updated
DROP TRIGGER IF EXISTS internal_auto_task_events ON public.tasks;
CREATE TRIGGER internal_auto_task_events
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_task_events();
