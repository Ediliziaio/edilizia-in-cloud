-- Trigger: log opportunity created
CREATE OR REPLACE FUNCTION public.log_opportunity_created() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  VALUES (NEW.contact_id, NEW.company_id, 'opportunity_created',
    'Opportunità creata: ' || NEW.name,
    jsonb_build_object('opportunity_id', NEW.id, 'opportunity_name', NEW.name, 'value', NEW.value),
    COALESCE(auth.uid(), NEW.assigned_to));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
