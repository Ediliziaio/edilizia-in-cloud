-- ═══════════════════════════════════════════════════════
-- NEW: appointment trigger functions
-- ═══════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.trigger_internal_auto_appointment_events() CASCADE;
CREATE OR REPLACE FUNCTION public.trigger_internal_auto_appointment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'appointment_updated', 'appointment', NEW.id, row_to_json(NEW));
  RETURN NEW;
END;
$$;
