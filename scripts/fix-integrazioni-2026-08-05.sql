-- ============================================================================
-- AGGIORNAMENTO ore 15:45 — eseguito nel frattempo (su istruzione esplicita):
--   - cronAuth.ts accetta anche l'header x-internal-cron-secret (fix
--     alternativo e piu' pulito del punto 1: risolve whatsapp-operational-
--     reminders e ogni funzione cronAuth senza toccare la funzione SQL).
--   - email-sequenze-tick e generate-recurring-costs accettano cronSecretValido
--     (leggevano UNA variabile non valorizzata: 401 perenne).
--   - job 118: timeout pg_net 120s (la risposta ora viene registrata).
--   - ai-brain-seed-universal: auth interna da cron + seeding lanciato.
--
-- AGGIORNAMENTO ore 16:00 — verificato sul giro delle 15:45:
--   - 401 SPARITI: email-sequenze-tick e whatsapp-operational-reminders ora
--     passano l'auth (il loro secret combacia via cronSecretValido). I job 94
--     e 137 NON vanno piu' toccati.
--   - auto-topup: risposta finalmente registrata. Stripe rifiuta le carte dei
--     clienti ("insufficient funds" / "card declined") — piattaforma sana,
--     sono le 6 aziende ad avere carte che non pagano.
--   - brain_upsert_document: ON CONFLICT non combaciava con l'indice unico
--     (COALESCE mancante su company_id) -> upsert MAI funzionato. Corretta in
--     prod + migration 20280110000000. Seeding rilanciato: 87/87 indicizzati,
--     78 guide redazionali nel Brain universale con embedding.
--
-- RESTANO DA ESEGUIRE A MANO (incolla nel SQL editor):
--   1. cleanup_cestino_documenti senza RETURNING 1 (sotto) — 37 documenti
--      annullata/bozza verranno eliminati alla prima esecuzione (03:00).
--   2. Job 52 e 13: riscrivere il comando con URL letterale + Bearer anon +
--      x-cron-secret (le funzioni ora accettano cronAuth; il valore giusto
--      e' quello che gia' usano i job email, vedi jobid 59).
--   3. silvio_invoke_edge con doppio header (sotto) — opzionale, le funzioni
--      cronAuth sono gia' coperte dal fix lato codice.
--   4. Dal pannello: service_role nel Vault (cancellazioni calendario + 4
--      funzioni Silvio verify_jwt) e ELEVENLABS_WEBHOOK_SECRET (sweeper 503).
-- ============================================================================

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
-- 2-bis. auto-topup: gli addebiti VENGONO TENTATI e Stripe li rifiuta
--
--    Il crash sul .catch dimostrava che l'esecuzione arrivava alla riga 202,
--    cioe' dentro il ramo `if (pi.status !== "succeeded")`. Quindi la chiave
--    Stripe c'e', il PaymentIntent viene creato, e viene RIFIUTATO.
--    Motivi tipici: authentication_required (SCA), card_declined, oppure il
--    payment method non piu' agganciato al customer.
--
--    Verificato che nessun soldo si e' mosso: company_auto_topup.last_topup_at
--    mai valorizzato, e 0 righe in ai_credit_topups, whatsapp_credit_topups,
--    email_credits_log, whatsapp_credits_log, topup_outbox.
--
--    Per LEGGERE il motivo servono due cose:
--    (a) il fix gia' deployato, che mette i motivi in `failures` nella
--        risposta JSON;
--    (b) alzare il timeout di pg_net sul job 118: la funzione fa una chiamata
--        Stripe per azienda e supera i 5 secondi di default, quindi la
--        risposta non viene mai registrata in net._http_response. Gli altri
--        job lenti usano gia' timeout_milliseconds := 120000.
--
--    do $t$
--    declare c text;
--    begin
--      select command into c from cron.job where jobid = 118;
--      if c not like '%timeout_milliseconds%' then
--        perform cron.alter_job(118, command := replace(c,
--          'body := ''{}''::jsonb',
--          'body := ''{}''::jsonb, timeout_milliseconds := 120000'));
--      end if;
--    end $t$;
--
--    Poi, al giro successivo:
--      select left(content, 600) from net._http_response
--      where content like '%by_service%' order by id desc limit 1;
--
--    IN PIU': la RPC `increment_payment_failure_count` NON ESISTE nel
--    database. La chiama solo auto-topup-trigger. Significa che il contatore
--    dei pagamenti falliti non e' mai stato incrementato da nessuno: se
--    qualche parte del billing si aspetta quel valore per sospendere o
--    avvisare, sta leggendo un dato fermo a zero. Va creata, oppure va tolta
--    la chiamata — ma decidere quale delle due richiede sapere se quel
--    contatore serve a qualcuno.
-- ────────────────────────────────────────────────────────────────────────────


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
