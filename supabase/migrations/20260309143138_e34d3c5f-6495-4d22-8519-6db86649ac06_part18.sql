-- ═══════════════════════════════════════════════════════
-- Fix: update ticket_events function for ticket_assigned + ticket_updated
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_internal_auto_ticket_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always emit ticket_updated
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'ticket_updated', 'ticket', NEW.id, row_to_json(NEW));

  -- Status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'ticket_status_changed', 'ticket', NEW.id,
      jsonb_build_object('new', row_to_json(NEW), 'old', row_to_json(OLD)));
  END IF;

  -- Assigned
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'ticket_assigned', 'ticket', NEW.id, row_to_json(NEW));
  END IF;

  RETURN NEW;
END;
$$;
