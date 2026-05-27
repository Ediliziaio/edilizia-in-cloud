-- 2026-05-27: il trigger di delete legge il mapping PRIMA del cascade FK,
-- così può passare google_event_id + google_calendar_id direttamente
-- all'edge function. Risolve "cancello in CRM ma Google event resta" per
-- path che NON chiamano syncDeletedAppointment frontend:
--   - AppointmentDialog (legacy)
--   - InlineEditableDatesCard
--   - orderUtils cascade su delete order
-- + tutte le RPC server-side / future bulk delete.

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

  IF _user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _google_event_id IS NULL THEN
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

  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
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

-- BEFORE DELETE invece di AFTER per leggere il mapping prima del cascade FK
DROP TRIGGER IF EXISTS trg_gcal_sync_appointments ON public.appointments;
CREATE TRIGGER trg_gcal_sync_appointments
  BEFORE DELETE OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_google_calendar_sync();
