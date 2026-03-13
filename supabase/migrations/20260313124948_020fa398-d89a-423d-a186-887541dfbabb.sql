
-- 1. Fix notify_task_assigned: handle UPDATE OF assigned_to, fix action_url, respect prefs
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
  v_pref_enabled boolean;
BEGIN
  -- Only notify if assigned_to is set and not self-assigned
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if assigned_to actually changed
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- Skip if self-assigning
  IF NEW.assigned_to = COALESCE(NEW.created_by, NEW.assigned_to) AND TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Check user notification preferences
  SELECT task_assigned_in_app INTO v_pref_enabled
  FROM public.user_notification_preferences
  WHERE user_id = NEW.assigned_to;

  -- Default to true if no preferences row exists
  IF v_pref_enabled IS NOT NULL AND v_pref_enabled = false THEN
    RETURN NEW;
  END IF;

  v_body := NEW.title;
  IF NEW.due_date IS NOT NULL THEN
    v_body := v_body || ' — Scadenza: ' || to_char(NEW.due_date::date, 'DD/MM/YYYY');
  END IF;

  PERFORM create_notification(
    NEW.company_id,
    NEW.assigned_to,
    'task_assigned',
    CASE WHEN TG_OP = 'UPDATE' THEN 'Attività riassegnata a te' ELSE 'Nuova attività assegnata' END,
    v_body,
    'task',
    NEW.id,
    '/azienda/attivita'
  );

  RETURN NEW;
END;
$$;

-- Recreate trigger to fire on INSERT and UPDATE OF assigned_to
DROP TRIGGER IF EXISTS trg_notify_task_assigned ON tasks;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned();

-- 2. Function to create daily due-date notifications
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
