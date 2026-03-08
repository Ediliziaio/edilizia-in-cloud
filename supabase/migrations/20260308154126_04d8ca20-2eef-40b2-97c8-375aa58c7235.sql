-- 1. Add score column to marketing_contacts
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;

-- 2. Add allow_re_enrollment to automation_flows config (no schema change needed, uses config_json)

-- 3. Create DB trigger on call_logs to fire automation trigger event
CREATE OR REPLACE FUNCTION public.fire_call_registered_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (
      NEW.company_id,
      'call_registered',
      NEW.contact_id::text,
      'contact',
      jsonb_build_object(
        'call_id', NEW.id,
        'duration_sec', NEW.duration_sec,
        'outcome', NEW.outcome,
        'notes', NEW.notes,
        'user_id', NEW.user_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_call_registered_automation
AFTER INSERT ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.fire_call_registered_automation();