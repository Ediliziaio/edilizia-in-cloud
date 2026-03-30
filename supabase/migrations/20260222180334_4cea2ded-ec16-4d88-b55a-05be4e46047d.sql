-- Trigger: log contact created
DROP FUNCTION IF EXISTS public.log_contact_created() CASCADE;
CREATE OR REPLACE FUNCTION public.log_contact_created() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  VALUES (NEW.id, NEW.company_id, 'contact_created', 'Contatto creato', '{}'::jsonb, COALESCE(auth.uid(), NEW.assigned_to));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
