-- FASE 2: pg_cron jobs per sync automatica Google Calendar
-- Prerequisiti: estensioni pg_cron e pg_net devono essere abilitate nel progetto Supabase

-- 1. Sync automatica ogni 15 minuti (chiama cron-full-sync su tutti gli utenti connessi)
SELECT cron.schedule(
  'google-calendar-sync-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := '{"action": "cron-full-sync"}'::jsonb
  );
  $$
);

-- 2. Rinnovo webhook ogni 6 ore (rinnova i watch channels in scadenza)
SELECT cron.schedule(
  'google-calendar-renew-watches-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/google-calendar-webhook?action=renew_watches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
