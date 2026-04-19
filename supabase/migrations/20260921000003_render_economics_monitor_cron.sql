-- ============================================================================
-- RENDER ECONOMICS MONITOR — CRON JOB (Supermaster — Parte B7)
--
-- Schedula la edge function `render-economics-monitor` ogni ora.
-- Usa il pattern già consolidato (pg_cron + pg_net + internal_cron_secret).
--
-- Idempotente: cron.unschedule esistente + schedule nuovo.
-- ============================================================================

DO $$
BEGIN
  -- pg_cron e pg_net sono gestiti da Supabase — se non ci sono, skippa silenziosamente.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron non installato — cron job render-economics-monitor non pianificato.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net non installato — cron job render-economics-monitor non pianificato.';
    RETURN;
  END IF;

  -- Se esiste già uno schedule con lo stesso nome, lo rimuoviamo per ri-schedulare
  -- con eventuali modifiche a URL/headers.
  PERFORM cron.unschedule('render-economics-monitor-hourly')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'render-economics-monitor-hourly'
  );

  PERFORM cron.schedule(
    'render-economics-monitor-hourly',
    '17 * * * *',  -- offset 17 per distribuire il carico (nps:09:00, webhook:*/5, ai:*/30)
    $job$
      SELECT net.http_post(
        url     := current_setting('app.supabase_url', true) || '/functions/v1/render-economics-monitor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.internal_cron_secret', true)
        ),
        body    := '{}'::jsonb
      );
    $job$
  );
END $$;
