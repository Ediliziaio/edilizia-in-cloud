-- 3. Task assegnato → notifica assegnatario
DROP FUNCTION IF EXISTS public.notify_task_assigned() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = NEW.created_by THEN
    RETURN NEW;
  END IF;

  v_body := NEW.title;
  IF NEW.due_date IS NOT NULL THEN
    v_body := v_body || ' — Scadenza: ' || to_char(NEW.due_date::date, 'DD/MM/YYYY');
  END IF;

  PERFORM create_notification(
    NEW.company_id,
    NEW.assigned_to,
    'task',
    'Nuova attività assegnata',
    v_body,
    'task',
    NEW.id,
    '/azienda/task'
  );

  RETURN NEW;
END;
$$;
