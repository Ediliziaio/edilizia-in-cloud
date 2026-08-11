-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- 1) fire_marketing_automation: aggiunge changed_fields al payload di
--    contact_updated (abilita il filtro "scatta solo se cambia il campo X",
--    prima decorativo) e appointment_type ad appointment_booked (filtro tipo).
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
  _changed text[];
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
        _changed := ARRAY[]::text[];
        IF NEW.email IS DISTINCT FROM OLD.email THEN _changed := _changed || 'email'; END IF;
        IF NEW.phone IS DISTINCT FROM OLD.phone THEN _changed := _changed || 'phone'; END IF;
        IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN _changed := _changed || 'first_name'; END IF;
        IF NEW.last_name IS DISTINCT FROM OLD.last_name THEN _changed := _changed || 'last_name'; END IF;
        IF NEW.city IS DISTINCT FROM OLD.city THEN _changed := _changed || 'city'; END IF;
        IF NEW.address IS DISTINCT FROM OLD.address THEN _changed := _changed || 'address'; END IF;
        IF NEW.province IS DISTINCT FROM OLD.province THEN _changed := _changed || 'province'; END IF;
        IF NEW.region IS DISTINCT FROM OLD.region THEN _changed := _changed || 'region'; END IF;
        IF NEW.postal_code IS DISTINCT FROM OLD.postal_code THEN _changed := _changed || 'postal_code'; END IF;
        IF NEW.source IS DISTINCT FROM OLD.source THEN _changed := _changed || 'source'; END IF;
        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN _changed := _changed || 'assigned_to'; END IF;
        IF NEW.tags IS DISTINCT FROM OLD.tags THEN _changed := _changed || 'tags'; END IF;
        IF NEW.company_name IS DISTINCT FROM OLD.company_name THEN _changed := _changed || 'company_name'; END IF;

        _payload := jsonb_build_object(
          'email', NEW.email, 'phone', NEW.phone, 'source', NEW.source,
          'contact_type', NEW.contact_type, 'tags', NEW.tags,
          'assigned_to', NEW.assigned_to,
          'old_tags', OLD.tags, 'old_assigned_to', OLD.assigned_to,
          'changed_fields', to_jsonb(_changed)
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
        _payload := jsonb_build_object('appointment_id', NEW.id, 'title', NEW.title,
          'date', NEW.appointment_date, 'appointment_type', NEW.appointment_type);
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
          'status', NEW.status, 'old_status', OLD.status, 'appointment_type', NEW.appointment_type);
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

-- 2) ferie_richiesta: l'emettitore vecchio era su leave_requests (tabella che
--    NESSUN codice scrive). Le assenze reali stanno in hr_assenze_eventi.
CREATE OR REPLACE FUNCTION public.fire_hr_assenza_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _nome text;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  SELECT trim(coalesce(nome,'') || ' ' || coalesce(cognome,'')) INTO _nome
  FROM public.hr_profili WHERE id = NEW.hr_profilo_id;

  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (
    NEW.company_id, 'leave_requested', NEW.hr_profilo_id::text, 'employee',
    jsonb_build_object(
      'assenza_id', NEW.id,
      'dipendente.nome', _nome,
      'tipo', NEW.tipo,
      'data_inizio', NEW.data_inizio,
      'data_fine', NEW.data_fine,
      'giorni', NEW.giorni
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_assenza_automation ON public.hr_assenze_eventi;
CREATE TRIGGER trg_hr_assenza_automation
  AFTER INSERT ON public.hr_assenze_eventi
  FOR EACH ROW EXECUTE FUNCTION public.fire_hr_assenza_automation();
