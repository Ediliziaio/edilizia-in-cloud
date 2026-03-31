-- IMP07: Scheduled job per reminder automatico scadenza preventivi
-- Esegue ogni giorno alle 06:00 UTC (08:00 ora italiana estiva)
--
-- NOTA DEPLOY: prima di eseguire questa migration in un nuovo ambiente,
-- configura: SELECT set_config('app.supabase_url', 'https://TUO-PROGETTO.supabase.co', false);
-- oppure tramite Vault: ALTER DATABASE postgres SET app.supabase_url = 'https://TUO-PROGETTO.supabase.co';

SELECT cron.unschedule('quote-expiry-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quote-expiry-reminder');

SELECT cron.schedule(
  'quote-expiry-reminder',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/quote-expiry-reminder',
      headers := '{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
