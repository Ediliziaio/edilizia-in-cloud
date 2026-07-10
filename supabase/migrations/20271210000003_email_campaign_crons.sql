-- ════════════════════════════════════════════════════════════════════════════
-- Email marketing — cron MANCANTI per le campagne
-- ────────────────────────────────────────────────────────────────────────────
-- BUG: la UI permetteva di PROGRAMMARE una campagna (status='scheduled' +
-- scheduled_at) e di attivare "Rinvia a chi non ha aperto (48h)"
-- (resend_to_unopened), ma NESSUN cron invocava process-scheduled-campaigns
-- né resend-to-unopened → le campagne programmate non partivano MAI e il
-- toggle di rinvio era decorativo.
-- Pattern identico agli altri cron del repo (app.supabase_url + app.cron_secret).
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('process-scheduled-campaigns-5min');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'process-scheduled-campaigns-5min',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/process-scheduled-campaigns',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('resend-to-unopened-hourly');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'resend-to-unopened-hourly',
      '17 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/resend-to-unopened',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;
