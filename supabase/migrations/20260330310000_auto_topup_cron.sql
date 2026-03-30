-- Sprint 4 — Auto-topup cron schedule
SELECT cron.schedule('auto-topup-check','0 * * * *',
  $$ SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/auto-topup-trigger',
    headers := '{"x-cron-secret":"' || current_setting('app.cron_secret') || '"}',
    body := '{}'
  ); $$
);
