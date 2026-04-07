-- IMP-2: NPS Auto-cron — job pg_cron per invio survey ogni giorno alle 09:00
-- IMP-5: Webhook retry — job pg_cron ogni 5 minuti
-- IMP-6: AI usage alerts — job pg_cron ogni 30 minuti

-- 1. NPS survey: ogni giorno alle 09:00
SELECT cron.schedule(
  'nps-survey-daily',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/send-nps-survey',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.internal_cron_secret', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- 2. Webhook retry: ogni 5 minuti
SELECT cron.schedule(
  'retry-failed-webhooks',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/retry-failed-webhooks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.internal_cron_secret', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- 3. AI usage alerts: ogni 30 minuti
SELECT cron.schedule(
  'check-ai-usage-alerts',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/check-ai-usage-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.internal_cron_secret', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
