-- Trigger: log opportunity updates (stage, status, assigned_to)
DROP FUNCTION IF EXISTS public.log_opportunity_updates() CASCADE;
CREATE OR REPLACE FUNCTION public.log_opportunity_updates() RETURNS trigger AS $$
DECLARE
  old_stage_name text;
  new_stage_name text;
  assignee_name text;
BEGIN
  -- Stage change
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO old_stage_name FROM public.marketing_pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage_name FROM public.marketing_pipeline_stages WHERE id = NEW.stage_id;
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'stage_changed',
      'Fase cambiata: ' || COALESCE(old_stage_name,'?') || ' → ' || COALESCE(new_stage_name,'?'),
      jsonb_build_object('old_stage', old_stage_name, 'new_stage', new_stage_name, 'opportunity_name', NEW.name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;

  -- Status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'status_changed',
      'Stato opportunità: ' || NEW.status,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'opportunity_name', NEW.name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;

  -- Assigned_to change
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    SELECT first_name || ' ' || last_name INTO assignee_name FROM public.profiles WHERE id = NEW.assigned_to;
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'opportunity_assigned',
      'Opportunità assegnata a ' || COALESCE(assignee_name, '?'),
      jsonb_build_object('opportunity_name', NEW.name, 'assigned_to', NEW.assigned_to, 'assigned_name', assignee_name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
