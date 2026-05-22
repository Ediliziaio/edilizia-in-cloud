-- ============================================================================
-- pg_cron schedule per meta-ads-spend-check — ogni ora
-- ============================================================================
-- Verifica il superamento dei cap di spesa e auto-pausa le campagne se necessario.
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
    PERFORM cron.unschedule('meta-ads-spend-check-hourly')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-spend-check-hourly'
    );

    IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
      PERFORM cron.schedule(
        'meta-ads-spend-check-hourly',
        '30 * * * *',  -- :30 di ogni ora (sfalsato rispetto a sync-insights a :15)
        format(
          $cron$
          SELECT net.http_post(
            url := %L || '/functions/v1/meta-ads-spend-check',
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
      RAISE NOTICE 'Scheduled meta-ads-spend-check hourly';
    END IF;
  END IF;
END $$;
