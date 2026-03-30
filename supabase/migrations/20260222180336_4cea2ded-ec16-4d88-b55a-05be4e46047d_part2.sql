-- Trigger: log contact assigned_to change
CREATE OR REPLACE FUNCTION public.log_contact_assigned() RETURNS trigger AS $$
DECLARE
  assignee_name text;
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    SELECT first_name || ' ' || last_name INTO assignee_name FROM public.profiles WHERE id = NEW.assigned_to;
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.id, NEW.company_id, 'contact_assigned',
      'Contatto assegnato a ' || COALESCE(assignee_name, '?'),
      jsonb_build_object('assigned_to', NEW.assigned_to, 'assigned_name', assignee_name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
