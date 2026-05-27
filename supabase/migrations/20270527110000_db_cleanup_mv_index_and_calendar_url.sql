-- ============================================================================
-- CICLO 6 DB cleanup — 2 fix errori Postgres pre-esistenti
-- ============================================================================
-- 2026-05-27 — Applicata via 2 migration MCP atomiche:
--   1. db_cleanup_mv_unique_index
--   2. fix_notify_google_calendar_sync_hardcoded_url
--
-- ERRORI FIX:
--
-- ERR1 "cannot refresh materialized view mv_analytics_sede concurrently"
--   → PG richiede ≥1 UNIQUE INDEX per REFRESH CONCURRENTLY. La MV non ne aveva,
--     gli unique sono solo composti naturali (sede_id+mese).
--   → CREATE UNIQUE INDEX su (sede_id, mese).
--
-- ERR2 "null value in column url of http_request_queue" (ricorrente ~4/min)
--   → notify_google_calendar_sync() leggeva current_setting('app.supabase_url')
--     ma GUC non settato sul DB managed (no superuser). Risultato: url:=NULL
--     viola NOT NULL constraint di http_request_queue.
--   → URL hardcoded come silvio_invoke_edge + service_key fallback su vault.
--   → Aggiunto early return se service_key non disponibile (no più NULL url).
-- ============================================================================

-- ── Fix 1: UNIQUE INDEX per REFRESH CONCURRENTLY ────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analytics_sede_unique
  ON public.mv_analytics_sede (sede_id, mese);

COMMENT ON INDEX public.idx_mv_analytics_sede_unique IS
  'Required for REFRESH MATERIALIZED VIEW CONCURRENTLY — sede_id+mese univoco';

-- ── Fix 2: notify_google_calendar_sync con URL hardcoded ────────────────
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

  -- Service key: vault first, GUC fallback. Early return se nessuno.
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
    RAISE WARNING '[notify_google_calendar_sync] service key non disponibile, skip';
    RETURN COALESCE(NEW, OLD);
  END IF;

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
