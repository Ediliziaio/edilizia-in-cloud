-- ════════════════════════════════════════════════════════════════════════════
-- AI Features #5, #13, #15 — pg_cron schedule batch
-- ────────────────────────────────────────────────────────────────────────────
-- Schedula i nuovi worker:
--   - ai-voice-outbound-leads      → ogni 5 min (intercetta lead caldi)
--   - ai-financial-autopilot-daily → ogni giorno 06:30 UTC (prima del cron 07:00)
--   - ai-workflow-engine           → ogni 1 min (advance step pronti)
--
-- Idempotenti (unschedule prima di schedule).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_job text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Unschedule eventuali job esistenti (idempotente)
  FOREACH v_job IN ARRAY ARRAY[
    'ai-voice-outbound-leads',
    'ai-financial-autopilot-daily',
    'ai-workflow-engine'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(v_job);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Necessario anche pg_net per le HTTP call
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  -- Voice outbound: ogni 5 minuti
  PERFORM cron.schedule(
    'ai-voice-outbound-leads',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url:=current_setting('app.supabase_url', true) || '/functions/v1/ai-voice-outbound-leads',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.proactive_cron_secret', true)
      ),
      body:='{"source": "pg_cron_5min"}'::jsonb,
      timeout_milliseconds:=120000
    ) AS request_id;
    $cron$
  );

  -- Financial autopilot: 06:30 UTC daily
  PERFORM cron.schedule(
    'ai-financial-autopilot-daily',
    '30 6 * * *',
    $cron$
    SELECT net.http_post(
      url:=current_setting('app.supabase_url', true) || '/functions/v1/ai-financial-autopilot-daily',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.proactive_cron_secret', true)
      ),
      body:='{"source": "pg_cron_daily"}'::jsonb,
      timeout_milliseconds:=300000
    ) AS request_id;
    $cron$
  );

  -- Workflow engine: ogni minuto
  PERFORM cron.schedule(
    'ai-workflow-engine',
    '*/1 * * * *',
    $cron$
    SELECT net.http_post(
      url:=current_setting('app.supabase_url', true) || '/functions/v1/ai-workflow-engine',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.proactive_cron_secret', true)
      ),
      body:='{"source": "pg_cron_1min"}'::jsonb,
      timeout_milliseconds:=60000
    ) AS request_id;
    $cron$
  );
END $$;

COMMIT;
