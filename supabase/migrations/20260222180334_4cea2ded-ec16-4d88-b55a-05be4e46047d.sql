
-- Trigger: log contact created
CREATE OR REPLACE FUNCTION public.log_contact_created() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
  VALUES (NEW.id, NEW.company_id, 'contact_created', 'Contatto creato', '{}'::jsonb, COALESCE(auth.uid(), NEW.assigned_to));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_contact_created
  AFTER INSERT ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_created();

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

CREATE TRIGGER trg_contact_assigned
  AFTER UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_assigned();

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

CREATE TRIGGER trg_opportunity_created
  AFTER INSERT ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_opportunity_created();

-- Trigger: log opportunity updates (stage, status, assigned_to)
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

CREATE TRIGGER trg_opportunity_updates
  AFTER UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_opportunity_updates();

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

CREATE TRIGGER trg_note_added
  AFTER INSERT ON public.marketing_contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_note_added();

-- Trigger: log document uploaded
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

CREATE TRIGGER trg_document_uploaded
  AFTER INSERT ON public.marketing_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_document_uploaded();
