-- 2. Function to create daily due-date notifications
DROP FUNCTION IF EXISTS public.create_task_due_notifications() CASCADE;
CREATE OR REPLACE FUNCTION public.create_task_due_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row_count integer;
BEGIN
  -- Tasks due today
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT DISTINCT ON (t.id)
    t.company_id,
    t.assigned_to,
    'task_due',
    'Attività in scadenza oggi',
    t.title,
    'task',
    t.id,
    '/azienda/attivita'
  FROM tasks t
  WHERE t.due_date::date = CURRENT_DATE
    AND t.status NOT IN ('completata', 'annullata')
    AND t.assigned_to IS NOT NULL
    AND t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.entity_id = t.id
        AND n.type = 'task_due'
        AND n.created_at::date = CURRENT_DATE
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_notification_preferences p
      WHERE p.user_id = t.assigned_to
        AND p.task_due_soon_in_app = false
    );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_count := v_count + v_row_count;

  -- Overdue tasks (past due, not yet notified in last 24h)
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT DISTINCT ON (t.id)
    t.company_id,
    t.assigned_to,
    'task_overdue',
    'Attività scaduta',
    t.title || ' — Scaduta il ' || to_char(t.due_date::date, 'DD/MM/YYYY'),
    'task',
    t.id,
    '/azienda/attivita'
  FROM tasks t
  WHERE t.due_date::date < CURRENT_DATE
    AND t.status NOT IN ('completata', 'annullata')
    AND t.assigned_to IS NOT NULL
    AND t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.entity_id = t.id
        AND n.type = 'task_overdue'
        AND n.created_at > now() - interval '24 hours'
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_notification_preferences p
      WHERE p.user_id = t.assigned_to
        AND p.task_overdue_in_app = false
    );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_count := v_count + v_row_count;

  RETURN v_count;
END;
$$;
