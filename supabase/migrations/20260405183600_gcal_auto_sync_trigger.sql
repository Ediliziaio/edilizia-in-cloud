-- FASE 3: DB trigger per auto-sync appuntamenti -> Google Calendar
-- Prerequisito: estensione pg_net deve essere abilitata

-- Funzione che chiama google-calendar-sync quando un appuntamento cambia
CREATE OR REPLACE FUNCTION public.notify_google_calendar_sync()
RETURNS trigger AS $$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _appointment_id uuid;
  _action text;
  _conn_exists boolean;
BEGIN
  -- Determina l'azione in base all'operazione del trigger
  IF TG_OP = 'DELETE' THEN
    _company_id := OLD.company_id;
    _user_id := COALESCE(OLD.assigned_to, OLD.created_by);
    _appointment_id := OLD.id;
    _action := 'delete-event';

  ELSIF TG_OP = 'INSERT' THEN
    _company_id := NEW.company_id;
    _user_id := COALESCE(NEW.assigned_to, NEW.created_by);
    _appointment_id := NEW.id;
    _action := 'push-event';

  ELSE -- UPDATE
    _company_id := NEW.company_id;
    _user_id := COALESCE(NEW.assigned_to, NEW.created_by);
    _appointment_id := NEW.id;

    -- Verifica se un campo rilevante e' cambiato
    IF OLD.title IS DISTINCT FROM NEW.title
    OR OLD.appointment_date IS DISTINCT FROM NEW.appointment_date
    OR OLD.appointment_time IS DISTINCT FROM NEW.appointment_time
    OR OLD.appointment_end_time IS DISTINCT FROM NEW.appointment_end_time
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.formatted_address IS DISTINCT FROM NEW.formatted_address
    OR OLD.description IS DISTINCT FROM NEW.description THEN

      -- Se status = annullato/cancelled, elimina da Google
      IF NEW.status IN ('annullato', 'cancelled') THEN
        _action := 'delete-event';
      ELSE
        _action := 'update-event';
      END IF;

    ELSE
      -- Nessun campo rilevante cambiato, skip
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Se user_id non e' disponibile, skip
  IF _user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Verifica se l'utente ha una connessione Google attiva
  SELECT EXISTS(
    SELECT 1 FROM google_calendar_connections
    WHERE company_id = _company_id
      AND user_id = _user_id
      AND status = 'connected'
  ) INTO _conn_exists;

  IF NOT _conn_exists THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Chiama la Edge Function in modo asincrono via pg_net
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
      'userId', _user_id::text
    )
  );

  RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
  -- Non bloccare l'operazione CRM se la sync fallisce
  RAISE WARNING 'notify_google_calendar_sync failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger su INSERT, UPDATE, DELETE sulla tabella appointments
DROP TRIGGER IF EXISTS trg_gcal_sync_appointments ON appointments;

CREATE TRIGGER trg_gcal_sync_appointments
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION notify_google_calendar_sync();
