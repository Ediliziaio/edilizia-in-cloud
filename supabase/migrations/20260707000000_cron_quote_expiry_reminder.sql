-- IMP07: Scheduled job per reminder automatico scadenza preventivi
-- Esegue ogni giorno alle 06:00 UTC (08:00 ora italiana estiva)

SELECT cron.unschedule('quote-expiry-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quote-expiry-reminder');

SELECT cron.schedule(
  'quote-expiry-reminder',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/quote-expiry-reminder',
      headers := '{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
