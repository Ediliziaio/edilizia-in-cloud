-- Prenotazione collegata al CRM (22/09/2026).
--
-- 1) fire_marketing_automation: gli eventi degli appuntamenti portano
--    calendario, data e ora; quelli delle opportunità la fonte. Senza il
--    calendario un'automazione non poteva distinguere la demo di Edilizia in
--    Cloud dalla consulenza di Marketing Edile (stessa azienda, due marchi);
--    senza la fonte non si riconosceva un'opportunità nata da una risposta a
--    un'email a freddo (source = outreach_email).
--    Il resto della funzione è identico alla definizione viva in produzione
--    (letta con pg_get_functiondef il 22/09).
--
-- 2) Fase «No show» nelle pipeline della piattaforma che fissano le call:
--    subito dopo «Demo Fissata» (Pipeline Vendita SaaS) e dopo «Appuntamento
--    Fissato» (Marketing Edile). Spostare lì la scheda fa partire il recupero.
--    Idempotente: se la fase c'è già non si tocca niente.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fire_marketing_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _trigger_event text; _entity_id text; _entity_type text;
  _company_id uuid; _payload jsonb; _changed text[];
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

        -- Elenco dei campi CAMBIATI (per il filtro campo_filtro del trigger).
        -- NB: qui c'era `_changed := _changed || 'email'`. Con una stringa senza
        -- tipo Postgres risolve `anyarray || anyarray` invece di
        -- `anyarray || anyelement`, prova a leggere 'email' come array letterale
        -- e solleva "malformed array literal". Risultato: OGNI update che
        -- toccava uno di questi 12 campi veniva rifiutato, su tutti i tenant.
        -- array_append e' inequivocabile e non si presta all'ambiguita'.
        _changed := ARRAY[]::text[];
        IF NEW.email IS DISTINCT FROM OLD.email THEN _changed := array_append(_changed, 'email'); END IF;
        IF NEW.phone IS DISTINCT FROM OLD.phone THEN _changed := array_append(_changed, 'phone'); END IF;
        IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN _changed := array_append(_changed, 'first_name'); END IF;
        IF NEW.last_name IS DISTINCT FROM OLD.last_name THEN _changed := array_append(_changed, 'last_name'); END IF;
        IF NEW.city IS DISTINCT FROM OLD.city THEN _changed := array_append(_changed, 'city'); END IF;
        IF NEW.address IS DISTINCT FROM OLD.address THEN _changed := array_append(_changed, 'address'); END IF;
        IF NEW.province IS DISTINCT FROM OLD.province THEN _changed := array_append(_changed, 'province'); END IF;
        IF NEW.region IS DISTINCT FROM OLD.region THEN _changed := array_append(_changed, 'region'); END IF;
        IF NEW.postal_code IS DISTINCT FROM OLD.postal_code THEN _changed := array_append(_changed, 'postal_code'); END IF;
        IF NEW.source IS DISTINCT FROM OLD.source THEN _changed := array_append(_changed, 'source'); END IF;
        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN _changed := array_append(_changed, 'assigned_to'); END IF;
        IF NEW.tags IS DISTINCT FROM OLD.tags THEN _changed := array_append(_changed, 'tags'); END IF;
        IF NEW.company_name IS DISTINCT FROM OLD.company_name THEN _changed := array_append(_changed, 'company_name'); END IF;

        _payload := jsonb_build_object(
          'email', NEW.email, 'phone', NEW.phone, 'source', NEW.source,
          'contact_type', NEW.contact_type, 'tags', NEW.tags,
          'assigned_to', NEW.assigned_to,
          'old_tags', OLD.tags, 'old_assigned_to', OLD.assigned_to,
          'changed_fields', to_jsonb(_changed)
        );

        IF OLD.tags IS DISTINCT FROM NEW.tags THEN
          IF array_length(NEW.tags, 1) > COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_added';
          ELSIF array_length(NEW.tags, 1) < COALESCE(array_length(OLD.tags, 1), 0) THEN
            _trigger_event := 'tag_removed';
          END IF;
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
        _payload := jsonb_build_object('opportunity_id', NEW.id, 'name', NEW.name, 'value', NEW.value, 'status', NEW.status, 'pipeline_id', NEW.pipeline_id, 'stage_id', NEW.stage_id,
          'source', NEW.source);
      ELSIF TG_OP = 'UPDATE' THEN
        -- Entrare o uscire dal cestino non è un fatto commerciale: il ripristino
        -- rimette lo stato di prima, anche vinta o persa, e non deve far
        -- ripartire le automazioni di esito o di fase (20280918201000).
        IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
          RETURN NEW;
        END IF;

        -- Il payload si costruisce PRIMA, perche' serve a entrambi gli eventi.
        _payload := jsonb_build_object('opportunity_id', NEW.id, 'name', NEW.name, 'value', NEW.value,
          'status', NEW.status, 'old_status', OLD.status, 'stage_id', NEW.stage_id, 'old_stage_id', OLD.stage_id,
          'pipeline_id', NEW.pipeline_id, 'old_pipeline_id', OLD.pipeline_id, 'source', NEW.source);

        -- Esito: si emette SEMPRE quando lo stato cambia, anche se nello stesso
        -- momento e' cambiata la fase. Prima veniva perso.
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won', 'lost') THEN
          INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
          VALUES (_company_id,
                  CASE WHEN NEW.status = 'won' THEN 'opportunity_won' ELSE 'opportunity_lost' END,
                  _entity_id, _entity_type, _payload);
        END IF;

        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
          _trigger_event := 'pipeline_stage_change';
        ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won', 'lost') THEN
          -- Gia' emesso sopra: qui si esce senza duplicarlo.
          RETURN NEW;
        ELSE
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
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
        _payload := jsonb_build_object('appointment_id', NEW.id, 'title', NEW.title,
          'date', NEW.appointment_date, 'time', left(NEW.appointment_time::text, 5),
          'calendar_id', NEW.calendar_id, 'status', NEW.status,
          'appointment_type', NEW.appointment_type);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
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
        _payload := jsonb_build_object('appointment_id', NEW.id, 'title', NEW.title,
          'status', NEW.status, 'old_status', OLD.status, 'appointment_type', NEW.appointment_type,
          'date', NEW.appointment_date, 'time', left(NEW.appointment_time::text, 5),
          'calendar_id', NEW.calendar_id);
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

-- 2) «No show» subito dopo la fase della call fissata.
DO $no_show$
DECLARE
  r record;
  v_pos integer;
BEGIN
  FOR r IN
    SELECT p.id AS pipeline_id, p.company_id, s.id AS dopo_id
      FROM public.marketing_pipelines p
      JOIN public.marketing_pipeline_stages s ON s.pipeline_id = p.id
     WHERE (p.id = '00000000-0000-0000-0000-000000000010' AND s.name = 'Demo Fissata')
        OR (p.id = '193b7839-f388-4b50-ae05-e53717067d33' AND s.name = 'Appuntamento Fissato')
  LOOP
    IF EXISTS (SELECT 1 FROM public.marketing_pipeline_stages
                WHERE pipeline_id = r.pipeline_id AND lower(name) = 'no show') THEN
      CONTINUE;
    END IF;
    SELECT position INTO v_pos FROM public.marketing_pipeline_stages WHERE id = r.dopo_id;
    UPDATE public.marketing_pipeline_stages
       SET position = position + 1
     WHERE pipeline_id = r.pipeline_id AND position > v_pos;
    INSERT INTO public.marketing_pipeline_stages (pipeline_id, company_id, name, position, show_in_reports)
    VALUES (r.pipeline_id, r.company_id, 'No show', v_pos + 1, true);
  END LOOP;
END
$no_show$;
