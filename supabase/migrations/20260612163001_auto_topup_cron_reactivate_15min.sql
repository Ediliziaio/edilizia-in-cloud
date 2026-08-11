-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Riattiva e re-schedula il cron auto-topup (era active=false → l'auto-ricarica
-- non girava). Ogni 15 minuti per reattività stile GHL.
SELECT cron.unschedule('auto-topup-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-topup-check'
);

SELECT cron.schedule(
  'auto-topup-check',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/auto-topup-trigger',
    headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  ); $$
);
