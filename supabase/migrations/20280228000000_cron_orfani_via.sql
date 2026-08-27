-- Sei cron chiamavano funzioni che non esistono piu' — ne' deployate ne' nel
-- repo (cancellate ai tempi del tetto delle 500 edge function; i cron sono
-- rimasti orfani). I due giornalieri attivi producevano i 404 "Requested
-- function was not found" visti dal canarino:
--   ai-anomaly-detection-daily   (03:00)  → 404 ogni notte
--   ai-financial-autopilot-daily (06:30)  → 404 ogni mattina
--   weekly-customer-reports      (ven 17) → 404 ogni venerdi'
-- Gli altri tre erano gia' inattivi ma restavano nel registro come rumore.
-- Se una di queste feature rinasce, rinascera' con la sua migration.
DO $$
DECLARE
  nome text;
  v_job_id bigint;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'ai-anomaly-detection-daily',
    'ai-financial-autopilot-daily',
    'weekly-customer-reports',
    'ai-auto-execute-pending',
    'ai-workflow-engine',
    'fatt-zero-touch-orchestrator-tick'
  ] LOOP
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = nome;
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
      RAISE NOTICE 'rimosso cron orfano: %', nome;
    END IF;
  END LOOP;
END $$;
