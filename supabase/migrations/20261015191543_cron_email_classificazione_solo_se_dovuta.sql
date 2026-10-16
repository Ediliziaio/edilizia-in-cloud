-- I due worker selezionano email_inbox.categoria IS NULL: stesso predicato.
-- Il poller della posta resta attivo, così le nuove email continuano ad arrivare.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $migration$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid,jobname,command FROM cron.job WHERE active
    AND jobname IN ('email-ai-l1-classify-2min','email-ai-l3-batch-3min')
  LOOP
    IF strpos(j.command,'email_classificazione_solo_se_dovuta')>0 THEN CONTINUE; END IF;
    IF j.command NOT ILIKE '%net.http_post%' THEN
      RAISE EXCEPTION 'Comando job % cambiato: verificare prima di aggiornare',j.jobname;
    END IF;
    PERFORM cron.alter_job(j.jobid,command:=format(
      'DO $guard$ BEGIN /* email_classificazione_solo_se_dovuta */ IF EXISTS (SELECT 1 FROM public.email_inbox WHERE categoria IS NULL) THEN EXECUTE %L; END IF; END $guard$;',j.command));
  END LOOP;
END;
$migration$;
