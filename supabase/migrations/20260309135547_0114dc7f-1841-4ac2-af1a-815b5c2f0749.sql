-- 1) Add pg_cron job to process internal automation queue every minute
--
-- NOTA DEPLOY: prima di eseguire questa migration in un nuovo ambiente,
-- configura: SELECT set_config('app.supabase_url', 'https://TUO-PROGETTO.supabase.co', false);
-- Questo job puntava originariamente a un secondo progetto Supabase (guqgszwelffntrgtsycm).
-- Verificare che process-internal-automation sia deployata nel progetto corrente.

SELECT cron.schedule(
  'process-internal-automation-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:=current_setting('app.supabase_url', true) || '/functions/v1/process-internal-automation',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "INTERNAL_CRON_SECRET_PLACEHOLDER"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
