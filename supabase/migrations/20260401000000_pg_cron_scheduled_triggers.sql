-- pg_cron: daily execution of check-scheduled-triggers at 07:00 UTC
-- BLOCCO D — Step 3

-- Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role (required on Supabase)
GRANT USAGE ON SCHEMA cron TO postgres;

DO $$
BEGIN
  -- Remove existing job if present (idempotent)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-scheduled-triggers-daily') THEN
    PERFORM cron.unschedule('check-scheduled-triggers-daily');
  END IF;
END $$;

-- Schedule: every day at 07:00 UTC
SELECT cron.schedule(
  'check-scheduled-triggers-daily',
  '0 7 * * *',
  $$
    SELECT
      net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/check-scheduled-triggers',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb
      )
  $$
);
