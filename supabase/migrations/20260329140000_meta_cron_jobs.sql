-- Migration: meta cron jobs
-- Schedula i job pg_cron per meta-process-leads, meta-health-check e meta-token-refresh

-- ================================================================
-- Rimuovi job esistenti se presenti (idempotente)
-- ================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-process-leads-queue') THEN
    PERFORM cron.unschedule('meta-process-leads-queue');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-health-check-daily') THEN
    PERFORM cron.unschedule('meta-health-check-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-token-refresh-daily') THEN
    PERFORM cron.unschedule('meta-token-refresh-daily');
  END IF;
END $$;

-- ================================================================
-- Process leads ogni 2 minuti
-- ================================================================
SELECT cron.schedule(
  'meta-process-leads-queue',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-process-leads',
    headers:='{"Content-Type":"application/json","x-cron-secret":"13035e8e9570855959a5bf9c0803d117554d8162cf63e46b"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- ================================================================
-- Health check ogni giorno alle 06:00 UTC
-- ================================================================
SELECT cron.schedule(
  'meta-health-check-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-health-check',
    headers:='{"Content-Type":"application/json","x-cron-secret":"13035e8e9570855959a5bf9c0803d117554d8162cf63e46b"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- ================================================================
-- Token refresh ogni giorno alle 03:00 UTC (soglia 15gg scadenza)
-- ================================================================
SELECT cron.schedule(
  'meta-token-refresh-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-token-refresh',
    headers:='{"Content-Type":"application/json","x-cron-secret":"13035e8e9570855959a5bf9c0803d117554d8162cf63e46b"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
