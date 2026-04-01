-- pg_cron: daily execution of check-scheduled-triggers at 07:00 UTC
-- BLOCCO D — Step 3
-- Note: pg_cron extension and cron schema grant are managed by Supabase platform.
-- This migration only schedules (or re-schedules) the daily job.

DO $$
BEGIN
  -- Remove existing job if present (idempotent)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-scheduled-triggers-daily') THEN
    PERFORM cron.unschedule('check-scheduled-triggers-daily');
  END IF;
END $$;

-- Schedule: every day at 07:00 UTC
-- Uses pg_net (available on Supabase) to call the edge function
SELECT cron.schedule(
  'check-scheduled-triggers-daily',
  '0 7 * * *',
  $$
    SELECT
      net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/check-scheduled-triggers',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb
      )
  $$
);
