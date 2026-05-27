-- 2026-05-27: Fix duplicazione Google Calendar + delete non sincronizzato.
--
-- BUG duplicazione root cause:
--   - `notify_google_calendar_sync` trigger faceva pg_net su INSERT/UPDATE
--     IN PARALLELO al frontend che chiamava la stessa edge function.
--   - Race condition: il guard `select existing` di pushEvent non era
--     race-safe → entrambe le chiamate vedevano mapping null → entrambe
--     creavano un nuovo evento Google → 2 eventi per 1 appuntamento.
--     Caso peggiore osservato: 4 eventi (StrictMode dev × trigger × frontend).
--
-- BUG delete non sincronizzato root cause:
--   - FK `event_map.appointment_id` → ON DELETE CASCADE.
--   - Su DELETE su `appointments` il cascade ELIMINA il mapping PRIMA che
--     il trigger pg_net possa chiamare deleteEvent → la edge function
--     non trova più il mapping → ritorna "No mapping found" → Google
--     event resta orfano nel calendario.
--
-- Fix:
--   1. UNIQUE INDEX defensive (company_id, appointment_id, user_id) su
--      event_map. Race-safe contro doppio insert.
--   2. Trigger pg_net: skip INSERT e UPDATE non-cancel. Il frontend è
--      autoritativo (gestisce mapping + push + retry + toast errore).
--      Lasciato attivo SOLO per:
--      - DELETE row su appointments (safety net per cleanup orfani —
--        in genere il mapping è già stato CASCADE-eliminato, è ok).
--      - UPDATE con transizione status → annullato/cancelled (safety
--        net per cancellazioni server-side via RPC/bulk).
--   3. Cleanup busy_slots duplicati orfani (causati dal bug attuale).

-- ─── 1. UNIQUE constraint defensive ────────────────────────────────────
-- Collassa eventuali duplicati esistenti mantenendo il più vecchio.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, appointment_id, user_id
           ORDER BY created_at ASC
         ) AS rn
  FROM google_calendar_event_map
)
DELETE FROM google_calendar_event_map
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS gcal_event_map_uniq_apt_user
ON google_calendar_event_map (company_id, appointment_id, user_id);

-- ─── 2. Trigger function: solo DELETE / cancel transitions ────────────
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
BEGIN
  -- 2026-05-27: SOLO eventi server-side di cancellazione finiscono qui.
  -- INSERT e UPDATE non-cancel sono gestiti dal frontend (vedi
  -- syncSavedAppointment in MarketingAppointmentDialog) per evitare
  -- doppia chiamata + race condition con la edge function.
  IF TG_OP = 'DELETE' THEN
    _company_id := OLD.company_id;
    _user_id := COALESCE(OLD.assigned_to, OLD.created_by);
    _appointment_id := OLD.id;
    _action := 'delete-event';

  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('annullato', 'cancelled')
        AND OLD.status NOT IN ('annullato', 'cancelled') THEN
    _company_id := NEW.company_id;
    _user_id := COALESCE(NEW.assigned_to, NEW.created_by);
    _appointment_id := NEW.id;
    _action := 'delete-event';

  ELSE
    -- INSERT / UPDATE non-cancel: skip — gestiti dal frontend
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _user_id IS NULL THEN
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
      'userId', _user_id::text
    )
  );

  RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_google_calendar_sync failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ─── 3. Cleanup busy_slots duplicati orfani (one-shot) ────────────────
DELETE FROM google_calendar_busy_slots
WHERE id IN (
  SELECT bs.id
  FROM google_calendar_busy_slots bs
  WHERE NOT EXISTS (
    SELECT 1
    FROM google_calendar_event_map em
    WHERE em.google_event_id = bs.google_event_id
      AND em.user_id = bs.user_id
      AND em.company_id = bs.company_id
  )
  AND bs.google_calendar_id = 'primary'
  AND bs.created_at > now() - interval '3 hours'
  AND EXISTS (
    SELECT 1 FROM google_calendar_busy_slots bs2
    WHERE bs2.company_id = bs.company_id
      AND bs2.user_id = bs.user_id
      AND bs2.start_at = bs.start_at
      AND bs2.summary = bs.summary
      AND bs2.id != bs.id
      AND EXISTS (
        SELECT 1 FROM google_calendar_event_map em
        WHERE em.google_event_id = bs2.google_event_id
          AND em.user_id = bs2.user_id
      )
  )
);
