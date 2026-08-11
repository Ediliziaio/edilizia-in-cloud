-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DO $$
BEGIN
  PERFORM cron.unschedule('social-publish-scheduler');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No existing social-publish-scheduler job to unschedule';
END $$;

SELECT cron.schedule(
  'social-publish-scheduler',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/social-publish-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cron$
);
