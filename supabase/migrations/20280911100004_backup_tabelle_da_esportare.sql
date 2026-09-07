-- Il backup settimanale esportava otto tabelle scelte a mano nel 2026-09-04.
-- Ke Bei Serramenti, l'azienda più grande, ha 13.963 righe di listino_griglia,
-- 292 voci di listino fornitore, 119 famiglie di articoli, 53 tariffe, 48
-- fornitori, 137 ticket: niente di tutto questo era nel file. Il backup
-- salvava l'anagrafica e lasciava fuori il lavoro.
--
-- Da qui l'elenco lo decide il catalogo: ogni tabella di public con una colonna
-- company_id entra, tranne quelle che sono telemetria, log o cache — si
-- rigenerano da sole e gonfierebbero il file senza dire niente di nuovo.
-- Una tabella nuova con company_id entra nel backup il sabato successivo senza
-- che nessuno debba ricordarsene.

CREATE OR REPLACE FUNCTION public.admin_tabelle_da_esportare()
RETURNS TABLE (tabella text, righe_stimate bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
  SELECT c.relname::text,
         GREATEST(c.reltuples::bigint, 0)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'company_id' AND NOT a.attisdropped)
     AND c.relname NOT LIKE '%\_log'      ESCAPE '\'
     AND c.relname NOT LIKE '%\_logs'     ESCAPE '\'
     AND c.relname NOT LIKE '%\_backup%'  ESCAPE '\'
     AND c.relname NOT LIKE 'zz\_%'       ESCAPE '\'
     AND c.relname NOT LIKE '\_%'         ESCAPE '\'
     AND c.relname NOT LIKE 'silvio\_%'   ESCAPE '\'
     AND c.relname NOT LIKE 'ai\_%'       ESCAPE '\'
     AND c.relname NOT LIKE 'mv\_%'       ESCAPE '\'
     AND c.relname NOT IN (
       'user_sessions', 'notifications', 'login_attempts', 'web_vitals_events',
       'attribution_pageviews', 'attribution_sessions', 'system_health_metrics',
       'integration_health_log', 'email_delivery_log', 'automation_trigger_events',
       'internal_chat_channels', 'internal_chat_members', 'internal_chat_messages',
       'tool_execution_log', 'company_activity_log', 'central_audit_log',
       'email_otp_codes', 'push_tokens', 'active_company_selection',
       'company_health_scores', 'sa_company_problems', 'cfo_weekly_reports',
       'lifecycle_email_sends', 'pipeline_forecasts', 'battito_esterno',
       'siti_metriche_giornaliere', 'siti_pagine_giornaliere'
     )
   ORDER BY c.relname;
$function$;

REVOKE ALL ON FUNCTION public.admin_tabelle_da_esportare() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tabelle_da_esportare() TO service_role;
