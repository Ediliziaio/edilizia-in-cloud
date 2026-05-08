-- ════════════════════════════════════════════════════════════════════════════
-- Cron: cleanup-capture-orphans — ogni notte alle 02:00 UTC
-- Elimina file storage e runs orfani da preventivo_da_foto_runs
-- (failed/pending/analyzing_images da più di 7 giorni)
-- ════════════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'cleanup-capture-orphans-daily',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/cleanup-capture-orphans',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
