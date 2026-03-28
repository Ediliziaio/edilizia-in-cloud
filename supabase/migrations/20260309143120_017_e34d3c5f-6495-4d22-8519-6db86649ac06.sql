-- ═══════════════════════════════════════════════════════
-- Fix: update order_status function to also emit order_completed
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_internal_auto_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always emit order_updated
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'order_updated', 'order', NEW.id, row_to_json(NEW));

  -- Status changed
  IF OLD.current_status_id IS DISTINCT FROM NEW.current_status_id THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'order_status_changed', 'order', NEW.id,
      jsonb_build_object('new', row_to_json(NEW), 'old', row_to_json(OLD)));
  END IF;

  -- Order completed (check for common "completed" status names)
  IF OLD.current_status_id IS DISTINCT FROM NEW.current_status_id THEN
    -- Check if the new status name indicates completion
    PERFORM 1 FROM order_statuses
      WHERE id = NEW.current_status_id
        AND (lower(name) IN ('completato', 'completed', 'chiuso', 'closed', 'consegnato', 'delivered'));
    IF FOUND THEN
      INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
      VALUES (NEW.company_id, 'order_completed', 'order', NEW.id, row_to_json(NEW));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
