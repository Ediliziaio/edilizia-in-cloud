-- pg_cron extension is managed by Supabase platform, skip if exists
DO $$ BEGIN
  PERFORM cron.schedule(
    'generate-recurring-costs-monthly',
    '0 8 1 * *',
    $cron$
    SELECT net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/generate-recurring-costs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{"scheduled": true}'::jsonb
    );
    $cron$
  );
EXCEPTION WHEN unique_violation OR others THEN
  RAISE NOTICE 'Cron job already exists or could not be created: %', SQLERRM;
END $$;
