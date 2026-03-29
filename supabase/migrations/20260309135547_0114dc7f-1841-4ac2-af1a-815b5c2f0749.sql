-- 1) Add pg_cron job to process internal automation queue every minute
SELECT cron.schedule(
  'process-internal-automation-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://guqgszwelffntrgtsycm.supabase.co/functions/v1/process-internal-automation',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1cWdzendlbGZmbnRyZ3RzeWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNjE5MDMsImV4cCI6MjA4NTkzNzkwM30.YO26Ym5QRe-uTTnfblUshvpFuIo0Y_MMfP8Qaqa_ivw"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
