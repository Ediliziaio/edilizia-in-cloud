-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- FIX errore ricorrente "null value in column url of http_request_queue":
-- notify_google_calendar_sync() leggeva current_setting('app.supabase_url')
-- ma il GUC non è settato sul DB managed (no superuser). Risultato:
-- current_setting() ritorna ERRORE se manca il flag missing_ok, oppure NULL,
-- e in entrambi i casi url:=NULL viola NOT NULL constraint di http_request_queue.
--
-- FIX: usa URL hardcoded del progetto (come fa già silvio_invoke_edge).
-- Il SUPABASE_URL non cambia tra restart, è safe da hardcodare.
-- Aggiungo anche missing_ok=true sul service_role_key con fallback su vault.

CREATE OR REPLACE FUNCTION public.notify_google_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _appointment_id uuid;
  _action text;
  _conn_exists boolean;
  _google_event_id text;
  _google_calendar_id text;
  _mapping_user_id uuid;
  _service_key text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _company_id := OLD.company_id;
    _appointment_id := OLD.id;
    _action := 'delete-event';

    SELECT em.google_event_id, em.google_calendar_id, em.user_id
      INTO _google_event_id, _google_calendar_id, _mapping_user_id
    FROM google_calendar_event_map em
    WHERE em.appointment_id = OLD.id
    LIMIT 1;

    _user_id := COALESCE(_mapping_user_id, OLD.assigned_to, OLD.created_by);

  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('annullato', 'cancelled')
        AND OLD.status NOT IN ('annullato', 'cancelled') THEN
    _company_id := NEW.company_id;
    _appointment_id := NEW.id;
    _action := 'delete-event';

    SELECT em.google_event_id, em.google_calendar_id, em.user_id
      INTO _google_event_id, _google_calendar_id, _mapping_user_id
    FROM google_calendar_event_map em
    WHERE em.appointment_id = NEW.id
    LIMIT 1;

    _user_id := COALESCE(_mapping_user_id, NEW.assigned_to, NEW.created_by);

  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _user_id IS NULL OR _google_event_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM google_calendar_connections
    WHERE company_id = _company_id
      AND user_id = _user_id
      AND status = 'connected'
  ) INTO _conn_exists;

  IF NOT _conn_exists THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Service role key: vault first, GUC fallback. Skip se nessuno disponibile.
  BEGIN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets
    WHERE name IN ('supabase_service_role_key', 'service_role_key')
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _service_key := NULL; END;

  IF _service_key IS NULL THEN
    _service_key := current_setting('app.supabase_service_role_key', true);
  END IF;

  IF _service_key IS NULL OR _service_key = '' THEN
    RAISE WARNING '[notify_google_calendar_sync] service key non disponibile, skip notifica';
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- URL hardcoded come silvio_invoke_edge (no dipendenza da GUC mancante)
  PERFORM net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'action', _action,
      'companyId', _company_id::text,
      'appointmentId', _appointment_id::text,
      'userId', _user_id::text,
      'googleEventId', _google_event_id,
      'googleCalendarId', _google_calendar_id
    )
  );

  RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_google_calendar_sync failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
