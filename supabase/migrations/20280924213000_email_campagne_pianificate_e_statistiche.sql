-- ════════════════════════════════════════════════════════════════════════════
-- Email marketing: le campagne pianificate partono, e le aperture si contano
-- (24/09/2026)
-- ────────────────────────────────────────────────────────────────────────────
-- 1) STATISTICHE. get_email_stats_summary contava aperture e clic su
--    email_logs.status IN ('opened','clicked'), stati che nessuno scrive: il
--    tracciamento scrive opened_at/clicked_at e lo status resta 'delivered'.
--    «Tasso di apertura» e «Tasso di clic» del riquadro Statistiche erano
--    SEMPRE 0%, mentre la tabella delle campagne (by_campaign, già corretta)
--    mostrava i numeri veri. La correzione di luglio
--    (20271210000004) non va riapplicata così com'è: nel frattempo la funzione
--    ha preso il controllo assert_company_access, e quella versione lo
--    toglierebbe. Qui cambia SOLO il conteggio.
--
-- 2) CAMPAGNE PIANIFICATE. Nessun cron chiamava process-scheduled-campaigns:
--    la migrazione di luglio (20271210000003) lo creava con app.supabase_url e
--    app.cron_secret, parametri che su questo database non esistono. Nessuna
--    campagna pianificata è mai partita. Il cron qui sotto usa l'indirizzo
--    scritto e il segreto dal Vault, come gli altri, e aspetta al massimo 15
--    secondi: la funzione risponde subito e lavora dopo.
--
--    Prima di accenderlo, le campagne pianificate con più di un giorno di
--    ritardo tornano in bozza: altrimenti al primo giro partirebbero offerte
--    pensate per luglio. Oggi è una sola, di Demo Azienda 2 (31/07). La stessa
--    regola ora sta nella funzione, per ogni fermo futuro.
--
--    resend-to-unopened resta SENZA cron: rispetta disiscrizioni e lista di
--    soppressione ma non scala i crediti, e accenderlo aprirebbe un invio
--    gratis. Nessuna campagna ha l'opzione attiva.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1) Statistiche: aperture e clic dai timestamp, il resto invariato.
CREATE OR REPLACE FUNCTION public.get_email_stats_summary(
  p_company_id uuid,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(total bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint, unsubscribed bigint, spam bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint AS delivered,
    COUNT(*) FILTER (WHERE el.opened_at IS NOT NULL)::bigint AS opened,
    COUNT(*) FILTER (WHERE el.clicked_at IS NOT NULL)::bigint AS clicked,
    COUNT(*) FILTER (WHERE el.status = 'bounced')::bigint AS bounced,
    COUNT(*) FILTER (WHERE el.status = 'unsubscribed')::bigint AS unsubscribed,
    COUNT(*) FILTER (WHERE el.status = 'spam')::bigint AS spam
  FROM public.email_logs el
  WHERE el.company_id = p_company_id
    AND (p_campaign_id IS NULL OR el.campaign_id = p_campaign_id)
    AND (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to);
END;
$function$;

-- 2a) Le pianificate in ritardo di oltre un giorno tornano in bozza.
UPDATE public.email_campaigns
   SET status = 'draft'
 WHERE status = 'scheduled'
   AND scheduled_at < now() - interval '24 hours';

-- 2b) Il cron. I nomi di luglio si tolgono se mai esistessero.
DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
    FROM cron.job
   WHERE jobname IN ('process-scheduled-campaigns', 'process-scheduled-campaigns-5min', 'resend-to-unopened-hourly');
END $$;

SELECT cron.schedule(
  'process-scheduled-campaigns',
  '4-59/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/process-scheduled-campaigns',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
