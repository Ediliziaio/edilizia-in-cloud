-- MP-OPS-01 v2 — Cron settimanale per reportino committente
-- Eseguito ogni venerdì alle 17:00 UTC. Itera tutti i cantieri attivi delle
-- companies con weekly_reports_enabled=true e chiama il tool centrale.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotente: rimuovi schedule precedente se esiste
    PERFORM cron.unschedule('weekly-customer-reports')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-customer-reports');

    PERFORM cron.schedule(
      'weekly-customer-reports',
      '0 17 * * 5',  -- venerdì 17:00 UTC
      $cron$
      SELECT net.http_post(
        url := concat(current_setting('app.settings.supabase_url', true),
                      '/functions/v1/trigger-weekly-customer-reports'),
        headers := jsonb_build_object(
          'Authorization', concat('Bearer ', current_setting('app.settings.cron_token', true)),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron non disponibile — schedula trigger-weekly-customer-reports manualmente da edge function';
  END IF;
END $$;
