-- Retire only the obsolete provider's scheduled job. No financial data is removed.
DO $$
DECLARE
  old_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR old_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'bank-eb-nightly-sync'
    LOOP
      PERFORM cron.unschedule(old_job_id);
    END LOOP;
  END IF;
END;
$$;
