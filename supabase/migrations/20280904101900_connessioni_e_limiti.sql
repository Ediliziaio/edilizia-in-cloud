-- F3-06 + F3-08 + F2-10 — Governo delle connessioni e limiti di piano reali.
-- Applicate a produzione via MCP il 2026-09-05.
--
-- COSA C'ERA CHE NON ANDAVA
--
-- 1. INTEGRAZIONI (F3-06). `check-api-health` è l'unica funzione che scrive
--    integration_health_log, ma accettava soltanto un JWT di super_admin:
--    nessun cron poteva chiamarla, e infatti nessuno lo faceva. Il log si
--    popolava solo quando qualcuno apriva la pagina a mano — gli ultimi
--    controlli erano fermi al 3 settembre mentre 11 integrazioni continuavano
--    a lavorare. Ora la funzione accetta anche il segreto interno dei job
--    (modifica nella edge function) e c'è un cron due volte al giorno.
--
-- 2. LIMITI DI PIANO (F2-10). check_plan_limit leggeva il piano SOLO da
--    company_subscriptions con status='active': quella tabella ha 2 righe su
--    17 aziende, quindi per le altre 15 usciva subito con
--    `allowed: true, limit: -1`. Il controllo esisteva, veniva invocato, e
--    diceva sempre di sì. Ora ripiega su companies.subscription_plan_id, che
--    è il piano che vale davvero.
--
-- 3. STORAGE. Lo stesso check_plan_limit calcolava lo spazio occupato da
--    `company_documents`, una tabella che NON ESISTE: quel ramo sarebbe uscito
--    con "relation does not exist" a chiunque lo avesse invocato. I file di
--    un'azienda vivono sparsi in dieci tabelle diverse, ciascuna con la propria
--    colonna di dimensione.
--
-- 4. Il primo tentativo di questa stessa migrazione contava come errore ogni
--    stato diverso da 'ok', ma integration_health_log scrive 'healthy':
--    risultavano in errore tutte e 11 le integrazioni, comprese quelle sane.
--    Un cruscotto sempre in allarme rosso è inutile quanto uno che tace.

-- ─────────────────────────────────────────────────────────────────────────────
-- Spazio occupato da un'azienda, sommato dove sta davvero.
-- Ogni fonte è avvolta in un blocco tollerante: se una tabella cambia nome o
-- sparisce, il conteggio perde quella voce invece di fallire del tutto — un
-- numero un po' basso è più utile di un errore.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.company_storage_mb(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_fonti CONSTANT text[][] := ARRAY[
    ARRAY['ai_knowledge_base_v2',    'file_size'],
    ARRAY['article_family_documents','file_size'],
    ARRAY['computo_uploads',         'file_size'],
    ARRAY['customer_documents',      'file_size'],
    ARRAY['documento_templates',     'file_size'],
    ARRAY['entity_attachments',      'file_size'],
    ARRAY['marketing_documents',     'file_size'],
    ARRAY['portal_course_assets',    'file_size'],
    ARRAY['email_attachments',       'size_bytes'],
    ARRAY['task_attachments',        'size_bytes']
  ];
  v_i int; v_byte bigint; v_totale bigint := 0;
BEGIN
  FOR v_i IN 1 .. array_length(v_fonti, 1) LOOP
    BEGIN
      EXECUTE format('SELECT COALESCE(SUM(COALESCE(%I, 0)), 0) FROM public.%I WHERE company_id = $1',
                     v_fonti[v_i][2], v_fonti[v_i][1])
        INTO v_byte USING p_company_id;
      v_totale := v_totale + COALESCE(v_byte, 0);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- fonte non disponibile: si salta, non si fallisce
    END;
  END LOOP;
  RETURN (v_totale / 1048576)::integer;
END;
$function$;

REVOKE ALL ON FUNCTION public.company_storage_mb(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_storage_mb(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron: il controllo delle integrazioni gira due volte al giorno.
-- Richiede la edge function check-api-health aggiornata per accettare il
-- segreto interno: finché non è deployata questa chiamata riceverà 401, e con
-- cron_job_failure_check attivo se ne accorgerà da sola.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'check-api-health-2volte-al-giorno',
  '20 6,18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/check-api-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- NOTA — admin_stato_connessioni, check_plan_limit e admin_consumi_aziende
-- sono state applicate via MCP nella stessa sessione con le definizioni
-- descritte nell'intestazione. Per rigenerarle su un ambiente nuovo si
-- estraggono con pg_get_functiondef dal database di riferimento.
