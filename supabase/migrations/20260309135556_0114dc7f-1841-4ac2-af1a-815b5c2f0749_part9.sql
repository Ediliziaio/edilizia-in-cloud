DROP TRIGGER IF EXISTS trg_internal_auto_task_events ON public.tasks;
CREATE TRIGGER trg_internal_auto_task_events
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_task_events();
