-- Nessun invio/cancellazione/backfill: stesso insieme di candidati del worker.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $migration$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid,jobname,command FROM cron.job
    WHERE active AND jobname='meta-crm-conversion-sync-10min'
  LOOP
    IF strpos(j.command,'capi_solo_con_pixel_e_coda')>0 THEN CONTINUE; END IF;
    IF j.command NOT ILIKE '%net.http_post%' THEN
      RAISE EXCEPTION 'Comando job % cambiato: verificare prima di aggiornare',j.jobname;
    END IF;
    PERFORM cron.alter_job(j.jobid,command:=format(
      'DO $guard$ BEGIN /* capi_solo_con_pixel_e_coda */ IF EXISTS (
        SELECT 1 FROM public.meta_crm_conversion_events e
        JOIN public.meta_conversion_pixel p ON p.company_id=e.company_id
        WHERE p.is_active=true AND p.capi_token_encrypted IS NOT NULL
          AND e.status IN (''pending'',''failed'')
          AND (e.attempt_count IS NULL OR e.attempt_count<5)
      ) THEN EXECUTE %L; END IF; END $guard$;',j.command));
  END LOOP;
END;
$migration$;
