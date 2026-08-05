-- ============================================================================
-- Audit integrazioni del 2026-08-05 — i fix che restano da applicare.
--
-- I due qui sotto NON sono stati eseguiti di iniziativa: il primo tocca una
-- funzione SECURITY DEFINER che maneggia segreti, il secondo abilita la
-- cancellazione definitiva di 37 documenti fiscali. Vanno letti e decisi.
--
-- Cosa e' gia' stato fatto ed e' verificato in produzione:
--   - job 30/49/50/51/118: comandi riscritti (vedi fix-cron-app-settings.sql)
--   - google-calendar-sync: tolto il confronto a mano con SUPABASE_ANON_KEY
--   - auto-topup-trigger: corretto il .catch su un Thenable (deployato)
--   - platform_settings: acceso il bidirezionale del calendario
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. silvio_invoke_edge manda l'header con il nome sbagliato
--
--    Manda 'x-internal-cron-secret', ma _shared/cronAuth.ts legge SOLO
--    'x-cron-secret'. Le funzioni che usano quel helper rispondono 401 a
--    ogni chiamata: verificato su whatsapp-operational-reminders, 401 ogni
--    15 minuti, mentre pg_cron registra "succeeded" perche' net.http_post
--    considera riuscito l'AVER SPEDITO la richiesta.
--
--    La funzione alimenta 11 job attivi: silvio-action-runner (ogni 30
--    secondi), silvio-generation-worker, silvio-outbound-worker,
--    whatsapp-operational-reminders, sync-meta-templates,
--    sa-conversation-intel-daily, silvio-daily-briefing,
--    silvio-admin-briefing, silvio-chief-of-staff, silvio-memory-extract.
--
--    Il fix aggiunge il secondo header senza togliere il primo: chi legge
--    'x-internal-cron-secret' continua a funzionare, chi legge
--    'x-cron-secret' inizia a funzionare. Non ci sono regressioni possibili.
--
--    ATTENZIONE, resta un secondo problema che questo fix NON risolve:
--    quando il Vault non ha la service_role, il Bearer diventa il cron
--    secret, che non e' un JWT. Le 4 funzioni con verify_jwt = true
--    (silvio-daily-briefing, silvio-admin-briefing, silvio-chief-of-staff,
--    silvio-memory-extract) vengono respinte dal GATEWAY prima ancora di
--    partire. Si sblocca mettendo la service_role nel Vault — la stessa che
--    manca a notify_google_calendar_sync per propagare a Google le
--    cancellazioni di appuntamento.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_invoke_edge(p_function_name text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_cron_secret text;
  v_bearer text;
  v_request_id bigint;
BEGIN
  v_url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_function_name;
  v_cron_secret := NULLIF(current_setting('app.settings.internal_cron_secret', true), '');
  IF v_cron_secret IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_cron_secret
      FROM vault.decrypted_secrets
      WHERE name IN ('silvio_internal_cron_secret', 'internal_cron_secret')
      ORDER BY (name = 'silvio_internal_cron_secret') DESC
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_cron_secret := NULL; END;
  END IF;
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE WARNING '[silvio_invoke_edge] cron secret mancante (app.settings/vault) per %', p_function_name;
    RETURN NULL;
  END IF;
  v_bearer := NULLIF(current_setting('app.settings.service_role_key', true), '');
  IF v_bearer IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_bearer
      FROM vault.decrypted_secrets
      WHERE name IN ('service_role_key', 'supabase_service_role_key')
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_bearer := NULL; END;
  END IF;
  v_bearer := COALESCE(NULLIF(v_bearer, ''), v_cron_secret);
  v_request_id := net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer,
      -- due nomi per lo stesso valore: le funzioni non concordano su quale
      -- leggere, e il costo di sbagliare e' un 401 silenzioso per mesi
      'x-internal-cron-secret', v_cron_secret,
      'x-cron-secret', v_cron_secret
    ),
    body := p_body
  );
  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[silvio_invoke_edge] error invoking %: %', p_function_name, SQLERRM;
  RETURN NULL;
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Il cestino dei documenti fiscali non si e' MAI svuotato
--
--    cleanup_cestino_documenti fa `DELETE ... RETURNING 1;` dentro una
--    funzione che ritorna void e senza clausola INTO. Postgres rifiuta con
--    "query has no destination for result data": il job 7 fallisce ogni
--    notte alle 03:00 da sempre.
--
--    PRIMA DI ESEGUIRE, leggi cosa cancella: al 2026-08-05 sono 37 documenti
--    (su 70 in cestino; gli altri 33 sono protetti dal filtro sullo stato).
--    Il piu' vecchio e' del 28 marzo. La cancellazione e' DEFINITIVA.
--
--    Conteggio aggiornato:
--      select count(*) from documenti_fiscali
--      where deleted_at < now() - interval '14 days'
--        and stato in ('annullata','bozza');
--
--    Il fix e' togliere RETURNING 1: GET DIAGNOSTICS ROW_COUNT funziona
--    comunque, e' proprio il modo corretto di contare le righe toccate.
-- ────────────────────────────────────────────────────────────────────────────
-- Recupera prima il corpo attuale, cambia solo quella riga e riapplica:
--   select pg_get_functiondef(oid) from pg_proc
--   where proname = 'cleanup_cestino_documenti';
--
-- La modifica e':
--   DELETE FROM documenti_fiscali
--   WHERE deleted_at IS NOT NULL
--     AND deleted_at < NOW() - INTERVAL '14 days'
--     AND stato IN ('annullata', 'bozza');   -- <- via il RETURNING 1
--   GET DIAGNOSTICS deleted_count = ROW_COUNT;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Segreti mancanti, per chi ha accesso al pannello
--
--    ELEVENLABS_WEBHOOK_SECRET / API key -> ai-conversations-sweeper risponde
--      503 ogni 15 minuti (24 volte nelle ultime 6 ore misurate).
--    CRON_SECRET            -> job 52 cleanup-capture-orphans
--    INTERNAL_CRON_SECRET   -> job 13 generate-recurring-costs
--    service_role nel Vault -> notify_google_calendar_sync + le 4 funzioni
--                              Silvio con verify_jwt = true
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- 4. QUERY DI CONTROLLO — la salute vera dei cron
--
--    'succeeded' in cron.job_run_details dice solo che la richiesta e' stata
--    spedita. Per sapere se e' andata a buon fine serve il codice HTTP.
-- ────────────────────────────────────────────────────────────────────────────
select coalesce(status_code::text, 'timeout') as codice,
       left(coalesce(content, coalesce(error_msg, '')), 80) as risposta,
       count(*) as occorrenze,
       max(created)::text as ultima
from net._http_response
where created > now() - interval '6 hours'
  and (status_code is null or status_code >= 400)
group by 1, 2
order by occorrenze desc;
