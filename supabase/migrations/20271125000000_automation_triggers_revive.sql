-- Audit automazioni: dà vita ai trigger a catalogo che non venivano MAI emessi.
-- Applicata in prod via MCP il 2026-07-02.
-- 1) contatto_assegnato (contact_assigned) — cambio di assigned_to sul contatto.
-- 2) appuntamento confermato/completato/no-show — stati specifici (prima solo
--    canceled/status_changed generico).
-- 3) cantiere_fase_completata (site_phase_completed) — fase ordine completata.
-- fire_marketing_automation viene ESTESA mantenendo il comportamento esistente
-- (tag_added/removed hanno la precedenza sul cambio assegnatario).
CREATE OR REPLACE FUNCTION public.fire_marketing_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _trigger_event text;
  _entity_id text;
  _entity_type text;
  _company_id uuid;
  _payload jsonb;
BEGIN
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

        -- tag_added / tag_removed hanno la precedenza (comportamento storico)
        IF OLD.tags IS DISTINCT FROM NEW.tags THEN
          IF array_length(NEW.tags, 1) > COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_added';
          ELSIF array_length(NEW.tags, 1) < COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_removed';
          END IF;
        -- NUOVO: contatto assegnato (o riassegnato) a un agente
        ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
          _trigger_event := 'contact_assigned';
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
          -- NUOVO: stati specifici (prima solo canceled/status_changed)
          IF NEW.status IN ('cancelled', 'canceled', 'annullato') THEN
            _trigger_event := 'appointment_canceled';
          ELSIF NEW.status IN ('confirmed', 'confermato') THEN
            _trigger_event := 'appointment_confirmed';
          ELSIF NEW.status IN ('completed', 'completato') THEN
            _trigger_event := 'appointment_completed';
          ELSIF NEW.status IN ('no_show', 'no-show', 'noshow') THEN
            _trigger_event := 'appointment_no_show';
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

  IF _trigger_event IS NULL OR _entity_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (_company_id, _trigger_event, _entity_id, _entity_type, _payload);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- 3) cantiere_fase_completata: fase ordine → 'completata'
CREATE OR REPLACE FUNCTION public.fire_phase_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completata' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (
      NEW.company_id,
      'site_phase_completed',
      NEW.order_id::text,
      'order',
      jsonb_build_object('phase_id', NEW.id, 'phase_name', NEW.name, 'order_id', NEW.order_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_phase_automation ON public.order_work_phases;
CREATE TRIGGER trg_fire_phase_automation
  AFTER UPDATE OF status ON public.order_work_phases
  FOR EACH ROW EXECUTE FUNCTION public.fire_phase_automation();

-- Preserve tag deltas after this complete emitter definition is installed.
do $patch_tags$
declare definition text; previous text; replacement text;
begin
  definition := pg_get_functiondef('public.fire_marketing_automation()'::regprocedure);
  previous := $old$        IF OLD.tags IS DISTINCT FROM NEW.tags THEN
          IF array_length(NEW.tags, 1) > COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_added';
          ELSIF array_length(NEW.tags, 1) < COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_removed';
          END IF;
        ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
          _trigger_event := 'contact_assigned';
        END IF;$old$;
  replacement := $new$        -- automation_tag_deltas_v1: replacement/removal of the last tag also counts.
        _payload := _payload || jsonb_build_object(
          'added_tags', to_jsonb(array(select unnest(coalesce(NEW.tags, '{}'::text[])) except select unnest(coalesce(OLD.tags, '{}'::text[])))),
          'removed_tags', to_jsonb(array(select unnest(coalesce(OLD.tags, '{}'::text[])) except select unnest(coalesce(NEW.tags, '{}'::text[]))))
        );
        IF jsonb_array_length(_payload->'added_tags') > 0 THEN
          INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
          VALUES(_company_id,'tag_added',_entity_id,_entity_type,_payload);
        END IF;
        IF jsonb_array_length(_payload->'removed_tags') > 0 THEN
          INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
          VALUES(_company_id,'tag_removed',_entity_id,_entity_type,_payload);
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
          INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
          VALUES(_company_id,'contact_assigned',_entity_id,_entity_type,_payload);
        END IF;
        -- The ordinary contact_updated event is emitted by the unchanged tail.$new$;
  if position('automation_tag_deltas_v1' in definition) > 0 then return; end if;
  if position(previous in definition) = 0 then
    -- The July emitter has the same dispatch block with this explanatory comment.
    previous := replace(previous, '        ELSIF OLD.assigned_to', E'        -- NUOVO: contatto assegnato (o riassegnato) a un agente\n        ELSIF OLD.assigned_to');
  end if;
  if position(previous in definition) = 0 then
    raise exception 'CRM emitter changed: review the tag dispatch block before applying this migration';
  end if;
  execute replace(definition,previous,replacement);
end $patch_tags$;
