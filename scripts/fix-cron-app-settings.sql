-- ============================================================================
-- 14 cron job falliscono da mesi. Diagnosi completa e stato del fix.
-- Aggiornato il 2026-08-05 dopo l'intervento in produzione.
--
-- IL PROBLEMA
--   14 job in cron.job costruiscono la chiamata alla edge function leggendo
--   dei parametri di configurazione che su questo database NON ESISTONO:
--       url := current_setting('app.supabase_url') || '/functions/v1/...'
--       Authorization := 'Bearer ' || current_setting('app.supabase_anon_key')
--
--   Chi usa la forma a un argomento muore subito con
--       ERROR: unrecognized configuration parameter "app.supabase_url"
--   chi usa la forma a due argomenti (..., true) ottiene NULL e costruisce
--   una URL nulla. In entrambi i casi la funzione non viene MAI chiamata:
--   nessun log applicativo, nessun errore in tabella. Solo silenzio.
--
--   I namespace usati sono DUE, non uno: app.* e app.settings.* .
--
-- QUANTO E' GRAVE (rilevato il 2026-08-04)
--   8 job attivi con tasso di fallimento del 100%:
--     auto-topup-check                   5.070 fallimenti  ogni 15 min
--     google-calendar-sync-every-15min   5.232 fallimenti  ogni 15 min
--     morning-briefing-capomastri-daily     90 fallimenti  giornaliero
--     auto-genera-giornale-daily            90 fallimenti  giornaliero
--     ai-anomaly-detection-daily            90 fallimenti  giornaliero
--     cleanup-capture-orphans-daily         88 fallimenti  giornaliero
--     weekly-customer-reports               12 fallimenti  settimanale
--     generate-recurring-costs-monthly       5 fallimenti  mensile
--   Piu' 6 job disattivati con lo stesso difetto.
--
-- LA STRADA CHE NON FUNZIONA
--   Impostare i parametri una volta per tutte sarebbe stato meglio che
--   riscrivere 14 comandi, ma Supabase non lo concede:
--       alter database postgres set app.supabase_url = '...';
--       ERROR: 42501: permission denied to set parameter "app.supabase_url"
--   Vale anche dall'editor SQL del pannello: non e' una questione di ruolo.
--
-- LA STRADA CHE FUNZIONA
--   Riscrivere il comando di ogni job con URL e chiave in chiaro, come fa
--   gia' google-calendar-renew-watches-6h. La chiave anon NON e' un segreto:
--   sta nel bundle JavaScript servito a ogni browser. La service_role invece
--   e' un segreto e non va mai messa in un cron.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. FATTO il 2026-08-05 — comandi riscritti
--
--    30 google-calendar-sync-every-15min   -> da 'failed' a 'succeeded'
--    49 auto-genera-giornale-daily
--    50 ai-anomaly-detection-daily
--    51 fatt-zero-touch-orchestrator-tick  (resta disattivo)
--
--    Nessuna di queste funzioni ha un controllo segreto nel codice: l'unico
--    gate e' verify_jwt del gateway, che la chiave anon soddisfa.
-- ────────────────────────────────────────────────────────────────────────────
-- Blocco applicato (i valori si leggono dal job che gia' li aveva in chiaro,
-- cosi' non vengono da fuori e restano in un posto solo):
--
-- do $fix$
-- declare
--   v_url text := 'https://rsbrguhkodgnqfomrevo.supabase.co';
--   v_key text; r record; nuovo text;
-- begin
--   select (regexp_match(command, 'Bearer ([A-Za-z0-9._-]+)'))[1] into v_key
--   from cron.job where jobname = 'google-calendar-renew-watches-6h';
--   if v_key is null then raise exception 'chiave non trovata'; end if;
--
--   for r in select jobid, command from cron.job where jobid in (30,49,50,51) loop
--     nuovo := replace(r.command, 'current_setting(''app.supabase_url'')', quote_literal(v_url));
--     nuovo := replace(nuovo, 'current_setting(''app.settings.supabase_url'', true)', quote_literal(v_url));
--     nuovo := replace(nuovo, 'current_setting(''app.supabase_anon_key'')', quote_literal(v_key));
--     nuovo := replace(nuovo, 'current_setting(''app.settings.cron_token'', true)', quote_literal(v_key));
--     if nuovo <> r.command then perform cron.alter_job(r.jobid, command := nuovo); end if;
--   end loop;
-- end $fix$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. RESIDUO — il calendario parte ma la funzione lo respinge
--
--    Il job 30 ora arriva a destinazione, ma google-calendar-sync risponde
--        403 {"error":"Unauthorized for cron"}
--    perche' confronta il token ricevuto con Deno.env.get("SUPABASE_ANON_KEY")
--    e i due non coincidono (index.ts riga ~1147).
--
--    Verificato: la chiave anon inviata e' quella giusta — identica a quella
--    del bundle di produzione, e accettata dalla piattaforma
--    (auth/v1/settings 200, rest/v1/companies 200).
--
--    Verificato anche: google_calendar_sync_log ha ZERO righe da sempre.
--    Quel percorso non ha mai funzionato, non e' una regressione.
--
--    Nota di sostanza: quel confronto non protegge nulla. La chiave anon e'
--    pubblica, sta nel bundle: chiunque potrebbe gia' oggi invocare la
--    sincronizzazione completa. E' un controllo che da' sicurezza apparente.
--
--    Rimedio proposto (richiede redeploy della funzione):
--      togliere verify_jwt = false da config.toml per google-calendar-sync e
--      lasciare che sia il gateway a pretendere un JWT valido di progetto,
--      eliminando il confronto fatto a mano. Stesso livello di protezione di
--      oggi, ma applicato dalla piattaforma invece che da una riga di codice
--      che confronta due variabili d'ambiente che non combaciano.
--      Tutti i chiamanti attuali mandano gia' un Bearer valido: il cron la
--      chiave anon, il trigger DB la service_role, il frontend il JWT utente.
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- 3. DA DECIDERE — job che riaccesi mandano roba fuori o muovono soldi
--
--    47 weekly-customer-reports     -> email ai clienti, venerdi' alle 17
--    48 morning-briefing-capomastri -> WhatsApp ai capomastri, ogni mattina
--   118 auto-topup-check            -> ricariche automatiche su Stripe, /15min
--
--    Il comando si sistema come gli altri, ma ripartono con mesi di arretrato
--    da smaltire: 118 in particolare potrebbe addebitare a molte aziende
--    entro un quarto d'ora dalla riaccensione. Vanno riaccesi uno per uno.
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- 4. BLOCCATI — servono segreti che non stanno nel database
--
--    13 generate-recurring-costs -> INTERNAL_CRON_SECRET (oppure un JWT
--                                   utente vero: la chiave anon non basta,
--                                   la funzione fa auth.getUser sul token)
--    52 cleanup-capture-orphans  -> CRON_SECRET, confronto secco senza
--                                   alternative
--    Piu' i disattivati 32, 36, 38, 76, 79 (service_role_key,
--    internal_cron_secret, proactive_cron_secret).
--
--    Si leggono dal pannello Supabase, Edge Functions → Secrets.
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- 5. VERIFICHE
-- ────────────────────────────────────────────────────────────────────────────
-- Quali job usano ancora i parametri fantasma, e quali:
select jobid, jobname, active,
       array(select distinct m[1]
             from regexp_matches(command, 'current_setting\(\s*''([a-z_.]+)''', 'g') m) as parametri
from cron.job
where command like '%current_setting%'
order by jobid;

-- Esito delle ultime esecuzioni dei job sistemati:
select j.jobname, d.start_time::text as quando, d.status,
       left(coalesce(d.return_message, ''), 80) as messaggio
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobid in (30, 49, 50)
  and d.start_time > now() - interval '2 hours'
order by d.start_time desc;

-- Il cron che parte non basta: serve la risposta HTTP della funzione.
-- Un 'succeeded' qui sotto significa solo "richiesta accodata".
select id, status_code, created::text as quando,
       left(coalesce(content, coalesce(error_msg, '')), 120) as corpo
from net._http_response
where created > now() - interval '30 minutes'
order by id desc limit 20;

-- E il log applicativo del calendario, che finora e' sempre stato vuoto:
select started_at::text, connections_found, connections_synced,
       connections_failed, status
from google_calendar_sync_log order by started_at desc limit 5;
-- atteso, quando il 403 sara' risolto: connections_found = 3.
