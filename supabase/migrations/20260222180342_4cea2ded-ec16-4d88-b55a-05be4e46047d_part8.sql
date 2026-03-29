-- Trigger: log note added
CREATE OR REPLACE FUNCTION public.log_note_added() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  VALUES (NEW.contact_id, NEW.company_id, 'note_added', 'Nota aggiunta',
    jsonb_build_object('note_id', NEW.id, 'content_preview', left(NEW.content, 100)),
    NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
