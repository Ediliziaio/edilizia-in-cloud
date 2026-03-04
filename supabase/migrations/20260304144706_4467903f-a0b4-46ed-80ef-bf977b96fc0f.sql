
-- Function to fire automation trigger via pg_net
CREATE OR REPLACE FUNCTION public.fire_marketing_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _trigger_event text;
  _entity_id text;
  _entity_type text;
  _company_id uuid;
  _payload jsonb;
  _supabase_url text;
  _service_key text;
BEGIN
  -- Determine trigger event based on table and operation
  CASE TG_TABLE_NAME
    WHEN 'marketing_contacts' THEN
      _entity_type := 'contact';
      IF TG_OP = 'INSERT' THEN
        _trigger_event := 'contact_created';
        _entity_id := NEW.id::text;
        _company_id := NEW.company_id;
        _payload := jsonb_build_object(
          'email', NEW.email, 'phone', NEW.phone, 'source', NEW.source,
          'contact_type', NEW.contact_type, 'tags', NEW.tags,
          'assigned_to', NEW.assigned_to
        );
      ELSIF TG_OP = 'UPDATE' THEN
        _trigger_event := 'contact_updated';
        _entity_id := NEW.id::text;
        _company_id := NEW.company_id;
        _payload := jsonb_build_object(
          'email', NEW.email, 'phone', NEW.phone, 'source', NEW.source,
          'contact_type', NEW.contact_type, 'tags', NEW.tags,
          'assigned_to', NEW.assigned_to,
          'old_tags', OLD.tags, 'old_assigned_to', OLD.assigned_to
        );

        -- Also fire tag_added / tag_removed if tags changed
        IF OLD.tags IS DISTINCT FROM NEW.tags THEN
          -- Check for added tags
          IF array_length(NEW.tags, 1) > COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_added';
          ELSIF array_length(NEW.tags, 1) < COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_removed';
          END IF;
        END IF;
      END IF;

    WHEN 'marketing_opportunities' THEN
      _entity_type := 'contact';
      _entity_id := NEW.contact_id::text;
      _company_id := NEW.company_id;
      IF TG_OP = 'INSERT' THEN
        _trigger_event := 'opportunity_created';
        _payload := jsonb_build_object('opportunity_id', NEW.id, 'name', NEW.name, 'value', NEW.value, 'status', NEW.status);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
          _trigger_event := 'pipeline_stage_change';
        ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'won' THEN
          _trigger_event := 'opportunity_won';
        ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'lost' THEN
          _trigger_event := 'opportunity_lost';
        ELSE
          -- No relevant change
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        _payload := jsonb_build_object('opportunity_id', NEW.id, 'name', NEW.name, 'value', NEW.value,
          'status', NEW.status, 'old_status', OLD.status, 'stage_id', NEW.stage_id, 'old_stage_id', OLD.stage_id);
      END IF;

    WHEN 'appointments' THEN
      _entity_type := 'contact';
      _entity_id := COALESCE(NEW.contact_id, OLD.contact_id)::text;
      _company_id := COALESCE(NEW.company_id, OLD.company_id);
      IF _entity_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;
      IF TG_OP = 'INSERT' THEN
        _trigger_event := 'appointment_booked';
        _payload := jsonb_build_object('appointment_id', NEW.id, 'title', NEW.title, 'date', NEW.appointment_date);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          IF NEW.status IN ('cancelled', 'canceled') THEN
            _trigger_event := 'appointment_canceled';
          ELSE
            _trigger_event := 'appointment_status_changed';
          END IF;
        ELSE
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        _payload := jsonb_build_object('appointment_id', NEW.id, 'title', NEW.title, 'status', NEW.status, 'old_status', OLD.status);
      END IF;

    ELSE
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END CASE;

  -- Skip if no trigger event detected
  IF _trigger_event IS NULL OR _entity_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Insert into a lightweight pending table for async processing
  -- We use direct insert into automation_queue via a matching function instead of net.http_post
  -- to avoid pg_net dependency. The cron job will pick these up.
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (_company_id, _trigger_event, _entity_id, _entity_type, _payload);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Create a lightweight event table for trigger events (avoids pg_net dependency)
CREATE TABLE IF NOT EXISTS public.automation_trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger_event text NOT NULL,
  entity_id text NOT NULL,
  entity_type text NOT NULL DEFAULT 'contact',
  payload jsonb DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_trigger_events_pending ON public.automation_trigger_events (created_at) WHERE processed = false;

ALTER TABLE public.automation_trigger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages trigger events"
  ON public.automation_trigger_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Attach triggers to marketing tables
CREATE TRIGGER trg_marketing_contact_automation
  AFTER INSERT OR UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();

CREATE TRIGGER trg_marketing_opportunity_automation
  AFTER INSERT OR UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();

CREATE TRIGGER trg_appointment_automation
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();
