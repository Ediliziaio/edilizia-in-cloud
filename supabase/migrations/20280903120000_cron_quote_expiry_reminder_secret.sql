-- Il job pg_cron "quote-expiry-reminder" mandava alla edge il letterale
-- INTERNAL_CRON_SECRET_PLACEHOLDER come x-cron-secret: la edge rispondeva 401 e
-- in produzione nessun promemoria di scadenza preventivo è mai partito.
-- Il segreto vero non può stare nel repo: lo si copia da un job già
-- funzionante (gli altri cron lo hanno letterale nel comando, perché su
-- Supabase i parametri app.* non sono impostabili). Idempotente: agisce solo
-- finché il comando contiene ancora il segnaposto.
DO $$
DECLARE
  v_secret text;
  v_job record;
BEGIN
  SELECT substring(command FROM 'x-cron-secret[":\s]*([^"''\s]+)') INTO v_secret
  FROM cron.job
  WHERE jobname = 'check-scheduled-triggers-daily'
    AND command ILIKE '%x-cron-secret%' AND command NOT ILIKE '%PLACEHOLDER%'
  LIMIT 1;

  IF v_secret IS NULL THEN
    SELECT substring(command FROM 'x-cron-secret[":\s]*([^"''\s]+)') INTO v_secret
    FROM cron.job
    WHERE command ILIKE '%x-cron-secret%' AND command NOT ILIKE '%PLACEHOLDER%'
    ORDER BY jobid
    LIMIT 1;
  END IF;

  IF v_secret IS NULL OR length(v_secret) < 8 THEN
    RAISE NOTICE 'quote-expiry-reminder: nessun job con segreto reale da cui copiare, lasciato com''è';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT jobid, command FROM cron.job
    WHERE jobname = 'quote-expiry-reminder' AND command ILIKE '%PLACEHOLDER%'
  LOOP
    PERFORM cron.alter_job(
      job_id  := v_job.jobid,
      command := replace(v_job.command, 'INTERNAL_CRON_SECRET_PLACEHOLDER', v_secret)
    );
    RAISE NOTICE 'quote-expiry-reminder: segreto impostato sul job %', v_job.jobid;
  END LOOP;
END $$;
