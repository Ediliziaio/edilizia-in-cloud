-- Schedule cron per i 4 nuovi job (defensive: solo se pg_cron disponibile)
-- ════════════════════════════════════════════════════════════════════════════
--   • morning-briefing-capomastri    @ 06:30 Europe/Rome (= 04:30 UTC inverno)
--   • auto-genera-giornale-cantiere  @ 18:00 Europe/Rome
--   • ai-anomaly-detection-daily     @ 03:00 UTC
--   • fatt-zero-touch-orchestrator   @ */15 minuti (process pending runs)
--
-- Tutti chiamano edge function via net.http_post con cron_token JWT.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron non disponibile — cron jobs NON schedulati. Trigger manualmente le edge function.';
    RETURN;
  END IF;

  -- ── Morning briefing (06:30 Rome → 04:30 UTC d'inverno, 05:30 UTC d'estate)
  -- Schedula a 04:30 UTC (orario invernale) come default. In estate sarà 06:30 ora locale.
  PERFORM cron.unschedule('morning-briefing-capomastri-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-briefing-capomastri-daily');
  PERFORM cron.schedule(
    'morning-briefing-capomastri-daily',
    '30 4 * * *',
    $cron$
    SELECT net.http_post(
      url := concat(current_setting('app.settings.supabase_url', true),
                    '/functions/v1/morning-briefing-capomastri'),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.cron_token', true)),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
    $cron$
  );

  -- ── Giornale auto (18:00 Rome → 16:00 UTC d'inverno)
  PERFORM cron.unschedule('auto-genera-giornale-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-genera-giornale-daily');
  PERFORM cron.schedule(
    'auto-genera-giornale-daily',
    '0 16 * * *',
    $cron$
    SELECT net.http_post(
      url := concat(current_setting('app.settings.supabase_url', true),
                    '/functions/v1/auto-genera-giornale-cantiere'),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.cron_token', true)),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
    $cron$
  );

  -- ── AI Anomaly Detection (03:00 UTC daily)
  PERFORM cron.unschedule('ai-anomaly-detection-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-anomaly-detection-daily');
  PERFORM cron.schedule(
    'ai-anomaly-detection-daily',
    '0 3 * * *',
    $cron$
    SELECT net.http_post(
      url := concat(current_setting('app.settings.supabase_url', true),
                    '/functions/v1/ai-anomaly-detection-daily'),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.cron_token', true)),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
    $cron$
  );

  -- ── Fatt Zero-Touch orchestrator (ogni 15 min — process pending runs)
  PERFORM cron.unschedule('fatt-zero-touch-orchestrator-tick')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fatt-zero-touch-orchestrator-tick');
  PERFORM cron.schedule(
    'fatt-zero-touch-orchestrator-tick',
    '*/15 * * * *',
    $cron$
    SELECT net.http_post(
      url := concat(current_setting('app.settings.supabase_url', true),
                    '/functions/v1/fatt-zero-touch-orchestrator'),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.cron_token', true)),
        'Content-Type', 'application/json'
      ),
      body := '{"batch": true}'::jsonb
    )
    $cron$
  );

  RAISE NOTICE 'Cron jobs schedulati: morning-briefing (04:30 UTC), giornale-auto (16:00 UTC), anomaly-detection (03:00 UTC), fatt-zero-touch-orchestrator (*/15 min)';
END $$;
