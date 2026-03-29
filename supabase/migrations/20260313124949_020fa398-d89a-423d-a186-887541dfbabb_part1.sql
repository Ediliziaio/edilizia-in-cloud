-- Recreate trigger to fire on INSERT and UPDATE OF assigned_to
DROP TRIGGER IF EXISTS trg_notify_task_assigned ON tasks;
