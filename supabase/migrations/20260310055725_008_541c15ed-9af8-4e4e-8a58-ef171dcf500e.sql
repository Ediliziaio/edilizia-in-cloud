CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned();
