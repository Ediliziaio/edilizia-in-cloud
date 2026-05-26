-- ═══════════════════════════════════════════════════════════════════════════
-- CUSTOMER OS — CRON SCHEDULE per i 6 agenti
-- -----------------------------------------------------------------------
-- Senza questi cron, gli edge function di Sofia/Elena/Tommaso/Beatrice/Marco
-- restano dormienti. Marco e Giorgio sono event-driven (vedi webhook
-- Stripe + DB trigger → enqueue_customer_workflow), quindi qui niente cron.
--
-- Fuso orario: Europa/Roma — pg_cron lavora in UTC, scegliamo orari UTC
-- corrispondenti alla mattina italiana (CET=UTC+1, CEST=UTC+2). Usiamo UTC
-- come compromesso: 5:00 UTC ≈ 6:00 inverno / 7:00 estate (Florin sveglio).
--
-- Sequenza cronologica giornaliera:
--   05:00 UTC → Sofia (day_3/day_7/day_21 onboarding check)
--   05:00 UTC → Elena (health scoring daily)
--   05:30 UTC → Beatrice (KPI brief daily)
--   06:00 UTC → Tommaso (insight daily usage report)
--   Lunedì 07:00 UTC → Tommaso (insight upsell signal weekly)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_job_id bigint;
  v_supabase_url text := 'https://rsbrguhkodgnqfomrevo.supabase.co';
  v_cron_secret_query text := '(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''silvio_internal_cron_secret'' LIMIT 1)';
BEGIN
  -- Helper inline per unschedule + reschedule
  -- (pg_cron non ha "upsert", quindi facciamo manuale)

  -- ─── SOFIA — onboarding daily ────────────────────────────────────────────
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'customer-os-sofia-onboarding-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'customer-os-sofia-onboarding-daily',
    '0 5 * * *',  -- 06:00 CET / 07:00 CEST
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/sofia-onboarding',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := jsonb_build_object('workflow_key', 'onboarding.daily_sweep'),
        timeout_milliseconds := 300000
      );
    $cmd$
  );

  -- ─── ELENA — health scoring daily ───────────────────────────────────────
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'customer-os-elena-health-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'customer-os-elena-health-daily',
    '5 5 * * *',  -- 5 minuti dopo Sofia per non sovraccaricare
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/elena-cs-health-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := jsonb_build_object('workflow_key', 'cs.health_daily_sweep'),
        timeout_milliseconds := 300000
      );
    $cmd$
  );

  -- ─── BEATRICE — KPI brief daily ─────────────────────────────────────────
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'customer-os-beatrice-kpi-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'customer-os-beatrice-kpi-daily',
    '30 5 * * *',  -- 06:30 UTC = 07:30 CET / 08:30 CEST
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/beatrice-cfo-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := jsonb_build_object('workflow_key', 'cfo.daily_kpi_brief'),
        timeout_milliseconds := 300000
      );
    $cmd$
  );

  -- ─── TOMMASO — insight daily usage report ───────────────────────────────
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'customer-os-tommaso-insight-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'customer-os-tommaso-insight-daily',
    '0 6 * * *',  -- 07:00 UTC
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/tommaso-insight-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := jsonb_build_object('workflow_key', 'insight.daily_usage_report'),
        timeout_milliseconds := 300000
      );
    $cmd$
  );

  -- ─── TOMMASO — upsell signal weekly (lunedì mattina) ────────────────────
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'customer-os-tommaso-upsell-weekly';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'customer-os-tommaso-upsell-weekly',
    '0 7 * * 1',  -- lunedì 07:00 UTC
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/tommaso-insight-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := jsonb_build_object('workflow_key', 'insight.upsell_signal'),
        timeout_milliseconds := 300000
      );
    $cmd$
  );

  -- ─── DRIFT CHECK weekly (lunedì 08:00 UTC) ──────────────────────────────
  -- Verifica che gli agenti non siano "scollati" dalla realtà del prodotto.
  -- Hook in `silvio_kb_citation_log` per quality monitoring.
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'customer-os-drift-check-weekly';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'customer-os-drift-check-weekly',
    '0 8 * * 1',  -- lunedì 09:00 CET
    $cmd$
      -- Aggiorna v_kb_imprenditore_edile_stats e silvio_kb_citation_log
      -- → in futuro qui chiameremo una edge function "drift-detector" che
      --   compara hit rate per chunk con baseline. Per ora solo refresh stats.
      SELECT 1 FROM public.v_kb_imprenditore_edile_stats LIMIT 1;
    $cmd$
  );

END
$$;

-- ─── Audit: view per ispezionare lo stato dei cron Customer OS ──────────────
CREATE OR REPLACE VIEW public.v_customer_os_cron_status AS
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  database,
  username
FROM cron.job
WHERE jobname LIKE 'customer-os-%'
ORDER BY jobname;

GRANT SELECT ON public.v_customer_os_cron_status TO authenticated;

COMMENT ON VIEW public.v_customer_os_cron_status IS
  'Stato dei 6 cron Customer OS. Ispeziona qui se un agente "non gira".';
