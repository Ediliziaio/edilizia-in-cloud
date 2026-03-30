-- ═══════════════════════════════════════════════════════
-- Fix: update task_events function for task_updated + task_completed
-- ═══════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.trigger_internal_auto_task_events() CASCADE;
CREATE OR REPLACE FUNCTION public.trigger_internal_auto_task_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always emit task_updated
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'task_updated', 'task', NEW.id, row_to_json(NEW));

  -- Task completed
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'task_completed', 'task', NEW.id, row_to_json(NEW));
  END IF;

  RETURN NEW;
END;
$$;
