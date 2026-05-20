-- ============================================================================
-- silvio_cron_schedule — pg_cron jobs per Silvio automation
-- ----------------------------------------------------------------------------
-- Configura 2 cron Supabase usando pg_cron + pg_net:
--   1. silvio-morning-brief-daily: 07:00 UTC (= 08:00 CET / 09:00 CEST)
--      Chiama l'edge function silvio-morning-brief con body {"mode":"all"}.
--      Usa Vault per recuperare INTERNAL_CRON_SECRET (no plain text in SQL).
--   2. brain-age-facts-daily: 02:00 UTC (= 03:00 CET / 04:00 CEST)
--      Chiama direttamente la RPC brain_age_facts() — no HTTP needed.
--
-- Idempotent: usa cron.unschedule prima di cron.schedule per evitare
-- duplicati su re-deploy.
-- ============================================================================

-- Estensioni: pg_cron e pg_net sono già installate su Supabase Pro nei
-- loro schemi standard (cron + extensions). Non rifacciamo CREATE
-- EXTENSION per non rompere privilegi. Se mancano, abilitarle da
-- Dashboard → Database → Extensions prima di applicare questa migration.

-- Salva il secret nel Vault (encrypted). Idempotent via ON CONFLICT.
-- Il secret è generato lato CLI con openssl rand -hex 32 e settato come
-- env var INTERNAL_CRON_SECRET sulla edge function via supabase secrets set.
-- Qui salviamo lo stesso valore nel vault così pg_cron può inviarlo via header.
SELECT vault.create_secret(
  '7ba155121a89aa294551bf3005e398db8473f7f0004a381a210e38dba908a9f1',
  'silvio_internal_cron_secret',
  'Token condiviso tra pg_cron e edge function silvio-morning-brief per auth interno'
)
WHERE NOT EXISTS (
  SELECT 1 FROM vault.secrets WHERE name = 'silvio_internal_cron_secret'
);

-- Job 1: morning brief — ogni mattina 07:00 UTC
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  -- Rimuovi job esistente con stesso nome (idempotent re-deploy)
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'silvio-morning-brief-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  -- Schedula nuovo job
  PERFORM cron.schedule(
    'silvio-morning-brief-daily',
    '0 7 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/silvio-morning-brief',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := '{"mode":"all"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$
  );
END
$$;

-- Job 2: aging memorie — ogni notte 02:00 UTC (RPC SQL diretta, no HTTP)
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'brain-age-facts-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'brain-age-facts-daily',
    '0 2 * * *',
    $cmd$SELECT public.brain_age_facts();$cmd$
  );
END
$$;

COMMENT ON EXTENSION pg_cron IS
'Scheduled jobs Silvio: morning-brief (08:00 IT) + brain-age-facts (03:00 IT). Configurati in 20260520144507_silvio_cron_schedule.sql.';
