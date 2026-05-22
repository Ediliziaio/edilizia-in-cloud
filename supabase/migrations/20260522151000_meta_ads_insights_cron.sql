-- ============================================================================
-- Cron schedule per meta-ads-sync-insights — ogni 4 ore
-- ============================================================================
-- Compagna a `20260522150000_meta_ads_campaign_management.sql`.
--
-- Schedula la sincronizzazione insights da Meta API.
-- Pattern replicato dalle altre cron job AI già esistenti.
-- ============================================================================

DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Recupera URL + service key da vault o env (se configurati)
  -- Fallback: skip se le variabili non sono settate
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
    v_service_role_key := NULL;
  END;

  -- Solo se pg_cron è disponibile + abbiamo le credenziali
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Rimuovi job esistente se presente (idempotenza)
    PERFORM cron.unschedule('meta-ads-sync-insights-4h')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-sync-insights-4h'
    );

    -- Schedule ogni 4 ore (alle :15 per non collidere con altri job)
    -- L'edge function legge tutte le companies attive
    IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
      PERFORM cron.schedule(
        'meta-ads-sync-insights-4h',
        '15 */4 * * *',
        format(
          $cron$
          SELECT net.http_post(
            url := %L || '/functions/v1/meta-ads-sync-insights',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || %L
            ),
            body := jsonb_build_object('force', false)
          );
          $cron$,
          v_supabase_url,
          v_service_role_key
        )
      );
      RAISE NOTICE 'Scheduled meta-ads-sync-insights every 4 hours';
    ELSE
      RAISE NOTICE 'pg_cron disponibile ma vault settings mancano — schedule skipped';
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron non installato — skip schedule';
  END IF;
END $$;

-- NB: rimosso `COMMENT ON SCHEMA cron` perché solo il proprietario dello
-- schema cron (postgres/supabase_admin) può modificarne i commenti. Il SQL
-- Editor di Supabase gira con role non-owner → fallirebbe con
-- "ERROR: 42501: must be owner of schema cron".
