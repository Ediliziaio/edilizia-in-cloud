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
