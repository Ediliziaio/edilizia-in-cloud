-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- 2026-05-27: Fix duplicazione Google Calendar + delete non sincronizzato.
--
-- Bug duplicazione root cause:
--   - notify_google_calendar_sync trigger faceva pg_net su INSERT/UPDATE
--     in parallelo al frontend che chiamava la stessa edge function.
--   - Race condition: il guard `select existing` di pushEvent non era
--     race-safe → entrambe le chiamate vedevano mapping null → entrambe
--     creavano un nuovo evento Google → 2 eventi per 1 appuntamento.
--     Caso peggiore: 4 eventi (StrictMode dev + trigger + frontend).
--
-- Bug delete non sincronizzato root cause:
--   - FK event_map.appointment_id → ON DELETE CASCADE.
--   - Su DELETE su appointments il cascade ELIMINA il mapping PRIMA
--     che il trigger pg_net possa chiamare deleteEvent → la edge function
--     non trova più il mapping → ritorna "No mapping found" → Google event
--     resta orfano nel calendario.
--
-- Fix:
--   1. Disabilita trigger pg_net su INSERT/UPDATE — il frontend è
--      autoritativo (gestisce mapping + push + retry + toast errore).
--      Trigger lasciato attivo SOLO per UPDATE status='annullato' come
--      safety net per cancellazioni server-side (es. RPC bulk).
--   2. UNIQUE INDEX (company_id, appointment_id, user_id) su event_map
--      come guard defensive contro race condition.
--   3. Per delete: cambio FK CASCADE → restrict + il frontend gestisce
--      la pulizia mapping prima del DELETE.  In alternativa, il trigger
--      su BEFORE DELETE chiama l'edge function in modo sincrono. Optato
--      per la versione semplice: solo frontend (già è il flow corretto
--      in MarketingAppointmentDialog.tsx riga 667-668).

-- ─── 1. UNIQUE constraint defensive contro mapping duplicati ──────────
-- Se esistono già duplicati (caso bug attuale), li dobbiamo collassare.
-- Mantieni il mapping più vecchio per appointment_id + user_id.
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

-- Crea UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS gcal_event_map_uniq_apt_user
ON google_calendar_event_map (company_id, appointment_id, user_id);

-- ─── 2. Sostituisci la trigger function: skip INSERT/UPDATE non-cancel ──
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
  -- doppia chiamata + race condition.
  IF TG_OP = 'DELETE' THEN
    -- Il frontend chiama già deleteEvent PRIMA del DELETE su appointments,
    -- quindi qui in genere il mapping è già stato cancellato.
    -- Lasciamo come safety-net per DELETE via RPC / admin / bulk.
    _company_id := OLD.company_id;
    _user_id := COALESCE(OLD.assigned_to, OLD.created_by);
    _appointment_id := OLD.id;
    _action := 'delete-event';

  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('annullato', 'cancelled')
        AND OLD.status NOT IN ('annullato', 'cancelled') THEN
    -- Transizione di status verso annullato/cancellato → sync delete
    _company_id := NEW.company_id;
    _user_id := COALESCE(NEW.assigned_to, NEW.created_by);
    _appointment_id := NEW.id;
    _action := 'delete-event';

  ELSE
    -- Tutti gli altri INSERT/UPDATE: skip — gestiti dal frontend
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip se manca l'utente
  IF _user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Verifica connessione Google attiva
  SELECT EXISTS(
    SELECT 1 FROM google_calendar_connections
    WHERE company_id = _company_id
      AND user_id = _user_id
      AND status = 'connected'
  ) INTO _conn_exists;

  IF NOT _conn_exists THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Chiama la Edge Function async via pg_net
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

-- ─── 3. Cleanup busy_slots duplicati orfani ─────────────────────────
-- I 3 busy_slots duplicati per "prova calendario" (utente Florin) sono
-- causati dal bug. Manteniamo quello che ha il mapping registrato e
-- cancelliamo gli altri.
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
  -- Conservativa: solo busy_slots con prefisso che sospetta origin CRM
  -- (titolo molto corto, creati di recente, primary calendar)
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
