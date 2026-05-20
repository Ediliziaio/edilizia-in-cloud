-- ============================================================================
-- bulk_scheduler_cron — schedula il runner ogni 5 min
-- ============================================================================

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'automation-bulk-scheduler-runner';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'automation-bulk-scheduler-runner',
    '*/5 * * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/automation-bulk-scheduler-runner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END
$$;
