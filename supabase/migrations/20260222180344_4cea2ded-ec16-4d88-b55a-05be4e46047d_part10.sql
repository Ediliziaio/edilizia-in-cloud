-- Trigger: log document uploaded
DROP FUNCTION IF EXISTS public.log_document_uploaded() CASCADE;
CREATE OR REPLACE FUNCTION public.log_document_uploaded() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  VALUES (NEW.contact_id, NEW.company_id, 'document_uploaded',
    'Documento caricato: ' || NEW.file_name,
    jsonb_build_object('document_id', NEW.id, 'file_name', NEW.file_name, 'file_type', NEW.file_type),
    NEW.uploaded_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
