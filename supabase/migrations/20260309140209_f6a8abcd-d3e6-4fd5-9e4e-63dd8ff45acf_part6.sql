-- 5) Task created
CREATE TRIGGER internal_auto_task_created
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('task_created', 'task');
