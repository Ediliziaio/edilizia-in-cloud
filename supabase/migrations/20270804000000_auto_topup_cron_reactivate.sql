-- Riattiva e re-schedula il cron auto-topup.
--
-- Era active=false → l'auto-ricarica non girava affatto. Inoltre chiama
-- /auto-topup-trigger che ora legge la config da company_auto_topup (la
-- tabella scritta dall'UI AutoTopupConfig), non più dalle colonne
-- {email,whatsapp,ai}_credits.auto_recharge_* mai popolate.
--
-- Cadenza portata da oraria a ogni 15 minuti per reattività stile GHL.

SELECT cron.unschedule('auto-topup-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-topup-check'
);

SELECT cron.schedule(
  'auto-topup-check',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/auto-topup-trigger',
    headers := jsonb_build_object(
      'x-cron-secret', current_setting('app.cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ); $$
);
