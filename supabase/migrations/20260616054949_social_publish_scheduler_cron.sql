-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_due
  ON public.social_posts (scheduled_at)
  WHERE status = 'scheduled';

DO $$
BEGIN
  PERFORM cron.unschedule('social-publish-scheduler');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No existing social-publish-scheduler job to unschedule';
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'social-publish-scheduler',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/social-publish-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
EXCEPTION WHEN unique_violation OR others THEN
  RAISE NOTICE 'Cron job already exists or could not be created: %', SQLERRM;
END $$;
