-- FIX 1 — P1: Configurare cron job bancari
-- Richiede le estensioni pg_cron e pg_net (attivabili da Supabase Dashboard > Extensions)
--
-- NOTA DEPLOY: prima di eseguire questa migration in un nuovo ambiente,
-- configura: SELECT set_config('app.supabase_url', 'https://TUO-PROGETTO.supabase.co', false);
-- oppure tramite Vault: ALTER DATABASE postgres SET app.supabase_url = 'https://TUO-PROGETTO.supabase.co';

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuovi job precedenti se esistono (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bank-sync-nightly') THEN
    PERFORM cron.unschedule('bank-sync-nightly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bank-check-expiry-daily') THEN
    PERFORM cron.unschedule('bank-check-expiry-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bank-auto-reconcile-nightly') THEN
    PERFORM cron.unschedule('bank-auto-reconcile-nightly');
  END IF;
END $$;

-- Sync bancario giornaliero: tutte le company alle 03:00 UTC
SELECT cron.schedule(
  'bank-sync-nightly',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/bank-sync-all-companies',
      headers := '{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- Check scadenze connessioni bancarie alle 08:00 UTC
SELECT cron.schedule(
  'bank-check-expiry-daily',
  '0 8 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/bank-check-expiry',
      headers := '{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- Riconciliazione automatica ogni notte alle 04:00 UTC
SELECT cron.schedule(
  'bank-auto-reconcile-nightly',
  '0 4 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/bank-auto-reconcile',
      headers := '{"Content-Type":"application/json","x-cron-secret":"INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- NOTA OPERATIVA:
-- Dopo il deploy, aggiornare il campo x-cron-secret nei 3 job sopra con il valore reale di INTERNAL_CRON_SECRET
-- tramite: UPDATE cron.job SET command = replace(command, 'INTERNAL_CRON_SECRET_PLACEHOLDER', '<SECRET>') WHERE jobname LIKE 'bank-%';
-- Oppure impostare app.internal_cron_secret come parametro DB:
-- ALTER DATABASE postgres SET app.internal_cron_secret = '<SECRET>';
-- e sostituire il valore hardcoded con current_setting('app.internal_cron_secret') nei job
