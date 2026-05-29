-- ============================================================================
-- MP-ADS-04 GAP-1 · pg_cron schedule per meta-ads-automation-runner — ogni ora
-- ============================================================================
-- Valuta le ad_automation_rules attive e applica pause/scale/notify (o richiede
-- conferma). Schedulato a :45 di ogni ora, sfalsato rispetto a sync-insights (:15)
-- e spend-check (:30), così gira su insights freschi.
-- ============================================================================

DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
    v_service_role_key := NULL;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('meta-ads-automation-runner-hourly')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-automation-runner-hourly'
    );

    IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
      PERFORM cron.schedule(
        'meta-ads-automation-runner-hourly',
        '45 * * * *',
        format(
          $cron$
          SELECT net.http_post(
            url := %L || '/functions/v1/meta-ads-automation-runner',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || %L
            ),
            body := '{}'::jsonb
          );
          $cron$,
          v_supabase_url,
          v_service_role_key
        )
      );
      RAISE NOTICE 'Scheduled meta-ads-automation-runner hourly (:45)';
    END IF;
  END IF;
END $$;
