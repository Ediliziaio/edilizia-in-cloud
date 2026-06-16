-- ============================================================================
-- social-publish-scheduler — cron ogni minuto per pubblicare i post programmati
-- ============================================================================
-- Funziona per OGNI azienda senza configurazione: la edge function seleziona i
-- social_posts con status='scheduled' e scheduled_at<=now e li pubblica su Meta.
-- Auth: header x-cron-secret = secret del vault `silvio_internal_cron_secret`
-- (stesso schema dei cron silvio/bulk-scheduler/process-dunning), validato dalla
-- function vs env INTERNAL_CRON_SECRET (già configurato project-wide).
-- ============================================================================

-- Indice parziale per la scansione del cron (post programmati e scaduti).
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_due
  ON public.social_posts (scheduled_at)
  WHERE status = 'scheduled';

-- Idempotente: rimuove l'eventuale job omonimo prima di ricrearlo.
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
