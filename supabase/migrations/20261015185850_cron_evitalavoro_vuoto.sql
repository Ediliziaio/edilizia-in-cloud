-- Mantiene cadenze, autenticazione, job disattivati e guardie dei worker.
-- Evita HTTP/Edge/telemetria quando non esiste lavoro; non avvia invii di prova.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';

CREATE OR REPLACE FUNCTION public.cron_ha_lavoro(p_job text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
BEGIN
  CASE p_job
    WHEN 'process-automation-queue' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.automation_queue q
        JOIN public.automation_flows f ON f.id=q.flow_id AND f.company_id=q.company_id
        WHERE q.status IN ('pending','waiting') AND q.execute_at<=now()
          AND f.status='published' AND f.deleted_at IS NULL
      ) OR EXISTS (SELECT 1 FROM public.automation_trigger_events WHERE processed=false);
    WHEN 'meta-process-leads-queue' THEN
      -- Include i lock scaduti: il worker deve poterli recuperare.
      RETURN EXISTS (SELECT 1 FROM public.integration_webhook_events WHERE status='pending');
    WHEN 'voice-campaign-dispatch' THEN
      -- Non eseguire claim/manutenzione se non esiste alcuna campagna da lavorare.
      -- Pianificazione, consenso, agenti e lock aziendali restano nel claim reale.
      RETURN EXISTS (
        SELECT 1 FROM public.ai_campaigns_v2 c
        WHERE c.tipo='chiamata' AND c.stato='in_corso'
          AND (c.data_fine<now() OR EXISTS (
            SELECT 1 FROM public.ai_campaign_contacts r
            WHERE r.campaign_id=c.id AND r.stato IN ('in_coda','prenotata','in_chiamata')
          ))
      ) OR EXISTS (
        SELECT 1 FROM public.ai_campaign_contacts
        WHERE stato IN ('prenotata','in_chiamata') AND ultimo_tentativo_il<now()-interval '75 minutes'
      );
    WHEN 'ai-voice-outbound-leads' THEN
      RETURN EXISTS (SELECT 1 FROM public.platform_settings
        WHERE key='richiamo_a_caldo_attivo' AND lower(trim(value))='true');
    WHEN 'automation-bulk-scheduler-runner' THEN
      RETURN EXISTS (SELECT 1 FROM public.bulk_scheduler_due_flows());
    ELSE
      RAISE EXCEPTION 'Job non gestito';
  END CASE;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cron_ha_lavoro(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cron_ha_lavoro(text) TO service_role;

DO $migration$
DECLARE j record; replacement text;
BEGIN
  FOR j IN SELECT jobid,jobname,command FROM cron.job
    WHERE jobname IN ('process-automation-queue','meta-process-leads-queue',
      'voice-campaign-dispatch','ai-voice-outbound-leads','automation-bulk-scheduler-runner') AND active
  LOOP
    IF strpos(j.command,'cron_ha_lavoro(')>0 THEN CONTINUE; END IF;
    IF j.command NOT ILIKE '%net.http_post%' THEN
      RAISE EXCEPTION 'Comando job % cambiato: verificare prima di aggiornare',j.jobname;
    END IF;
    -- Originale conservato integralmente come literal: nessuna lettura/stampa secret.
    replacement:=format('DO $guard$ BEGIN IF public.cron_ha_lavoro(%L) THEN EXECUTE %L; END IF; END $guard$;',j.jobname,j.command);
    PERFORM cron.alter_job(j.jobid,command:=replacement);
  END LOOP;
END;
$migration$;
