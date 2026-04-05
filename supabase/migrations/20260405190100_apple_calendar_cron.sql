-- Sync Apple Calendar ogni 10 minuti (no webhook support)
SELECT cron.schedule(
  'apple-calendar-sync-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/apple-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{"action": "cron-full-sync"}'::jsonb
  );
  $$
);
