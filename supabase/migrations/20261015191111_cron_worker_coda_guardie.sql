-- Solo sveglie cron: nessuna modifica a code, invii, credenziali o cadenze.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
CREATE OR REPLACE FUNCTION public.cron_worker_ha_lavoro(p_job text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
BEGIN
  CASE p_job
    WHEN 'silvio-generation-worker-2min' THEN
      -- Conserva sia i candidati sia la manutenzione dei job orfani/scaduti.
      RETURN EXISTS (SELECT 1 FROM public.silvio_generation_jobs
        WHERE (status='queued' AND tipo IN ('image','video','document'))
           OR (status='processing' AND updated_at<now()-interval '10 minutes'));
    WHEN 'silvio-outbound-worker-3min' THEN
      -- Include tentativi esauriti: il reconciler deve poterli chiudere.
      RETURN EXISTS (SELECT 1 FROM public.silvio_outbound_messages
        WHERE status='queued' AND (claimed_at IS NULL OR claimed_at<now()-interval '10 minutes'));
    WHEN 'silvio-action-runner' THEN
      -- Identico al claim corrente: le approvazioni umane non vanno saltate.
      RETURN EXISTS (SELECT 1 FROM public.silvio_action_queue
        WHERE status='queued' AND scheduled_for<=now() AND requires_approval=false);
    WHEN 'social-publish-scheduler' THEN
      RETURN EXISTS (SELECT 1 FROM public.social_posts
        WHERE (status='scheduled' AND scheduled_at<=now())
           OR (status='processing' AND next_attempt_at<=now()));
    WHEN 'process-scheduled-campaigns' THEN
      -- Include campagne troppo vecchie da riportare in bozza e invii bloccati.
      RETURN EXISTS (SELECT 1 FROM public.email_campaigns
        WHERE (status='scheduled' AND scheduled_at<=now())
           OR (status='sending' AND updated_at<now()-interval '60 minutes'));
    ELSE RAISE EXCEPTION 'Job non gestito';
  END CASE;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cron_worker_ha_lavoro(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cron_worker_ha_lavoro(text) TO service_role;

DO $migration$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid,jobname,command FROM cron.job WHERE active AND jobname IN (
    'silvio-generation-worker-2min','silvio-outbound-worker-3min','silvio-action-runner',
    'social-publish-scheduler','process-scheduled-campaigns')
  LOOP
    IF strpos(j.command,'cron_worker_ha_lavoro(')>0 THEN CONTINUE; END IF;
    IF j.command NOT ILIKE '%net.http_post%' AND j.command NOT ILIKE '%silvio_invoke_edge%' THEN
      RAISE EXCEPTION 'Comando job % cambiato: verificare prima di aggiornare',j.jobname;
    END IF;
    PERFORM cron.alter_job(j.jobid,command:=format(
      'DO $guard$ BEGIN IF public.cron_worker_ha_lavoro(%L) THEN EXECUTE %L; END IF; END $guard$;',
      j.jobname,j.command));
  END LOOP;
END;
$migration$;
