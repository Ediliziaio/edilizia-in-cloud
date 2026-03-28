CREATE TRIGGER trg_internal_auto_task_events
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_task_events();
