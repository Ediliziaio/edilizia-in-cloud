-- ============================================================================
-- FIX: 14 cron job falliscono da mesi per due parametri mancanti
--
-- IL PROBLEMA
--   14 job in cron.job costruiscono la chiamata alla edge function cosi':
--       url := current_setting('app.supabase_url') || '/functions/v1/...'
--       Authorization := 'Bearer ' || current_setting('app.supabase_anon_key')
--
--   Quei due parametri NON SONO IMPOSTATI su questo database. Verificato:
--       select current_setting('app.supabase_url', true);      -> null
--       select current_setting('app.supabase_anon_key', true); -> null
--
--   Quindi ogni esecuzione muore prima ancora di partire, con:
--       ERROR: unrecognized configuration parameter "app.supabase_url"
--
--   Non e' un errore della funzione: la funzione non viene MAI chiamata.
--   Ecco perche' nessuno se n'e' accorto — non ci sono log applicativi, non
--   ci sono errori nelle tabelle di stato, non c'e' niente. Solo silenzio.
--
-- QUANTO E' GRAVE (rilevato il 2026-08-04)
--   8 job ATTIVI con tasso di fallimento del 100%:
--
--     auto-topup-check                   5.070 fallimenti  ogni 15 min
--     google-calendar-sync-every-15min   5.232 fallimenti  ogni 15 min
--     morning-briefing-capomastri-daily     90 fallimenti  giornaliero
--     auto-genera-giornale-daily            90 fallimenti  giornaliero
--     ai-anomaly-detection-daily            90 fallimenti  giornaliero
--     cleanup-capture-orphans-daily         88 fallimenti  giornaliero
--     weekly-customer-reports               12 fallimenti  settimanale
--     generate-recurring-costs-monthly       5 fallimenti  mensile
--
--   Piu' 6 job disattivati che avrebbero lo stesso problema se riaccesi.
--
--   In concreto, sulla piattaforma oggi NON funzionano: la ricarica
--   automatica dei crediti, la generazione dei costi ricorrenti, il giornale
--   dei lavori automatico, il briefing mattutino ai capomastri, i report
--   settimanali ai clienti, il rilevamento anomalie AI e la sincronizzazione
--   dei calendari.
--
-- COME SI E' ARRIVATI QUI
--   Il job google-calendar-renew-watches-6h, l'unico che funziona, ha URL e
--   chiave scritti direttamente nel comando. Gli altri usano current_setting.
--   Probabilmente i parametri erano previsti e non sono mai stati impostati,
--   oppure sono spariti in un ripristino del database.
--
-- LA CHIAVE ANON NON E' UN SEGRETO
--   E' la chiave pubblica del progetto: sta gia' nel bundle JavaScript
--   servito ai browser e nel comando del job che funziona. Non e' la
--   service_role, che invece non va mai messa in un cron.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. IL FIX — due righe, sistemano tutti e 14 i job
--
--    Impostare i parametri a livello di database e' meglio che riscrivere i
--    14 comandi: vale anche per i job futuri che useranno lo stesso schema,
--    ed e' un punto solo da aggiornare se un domani cambiano URL o chiave.
-- ────────────────────────────────────────────────────────────────────────────
alter database postgres
  set app.supabase_url = 'https://rsbrguhkodgnqfomrevo.supabase.co';

alter database postgres
  set app.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYnJndWhrb2RnbnFmb21yZXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODQzODYsImV4cCI6MjA4OTk2MDM4Nn0.aHzsPcf09M0PYUmFqmJwZWiyoNjM2shWL12sHHUGSZc';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. VERIFICA — in una NUOVA sessione
--
--    ALTER DATABASE ... SET vale dalla connessione successiva: la sessione
--    in cui lo esegui continua a non vedere i parametri. pg_cron apre una
--    connessione nuova a ogni esecuzione, quindi per lui il fix e' immediato.
--    Se questa query torna null, chiudi e riapri l'editor SQL.
-- ────────────────────────────────────────────────────────────────────────────
select current_setting('app.supabase_url', true)      as url,
       left(current_setting('app.supabase_anon_key', true), 24) || '…' as chiave;
-- atteso: l'URL del progetto e l'inizio della chiave, non null.


-- ────────────────────────────────────────────────────────────────────────────
-- 3. CONTROLLO A CALDO — dopo 15-20 minuti
--
--    Il job del calendario gira ogni 15 minuti: e' il piu' rapido a dare un
--    riscontro. Se il fix ha funzionato, status passa da 'failed' a
--    'succeeded'.
-- ────────────────────────────────────────────────────────────────────────────
select j.jobname, d.start_time::text as quando, d.status,
       left(coalesce(d.return_message, ''), 80) as messaggio
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.command like '%current_setting(''app.%'
  and d.start_time > now() - interval '30 minutes'
order by d.start_time desc;
-- atteso: status 'succeeded'. Se resta 'failed', leggi il messaggio: a quel
-- punto sara' un errore VERO della funzione, non piu' del parametro mancante.

-- E il log applicativo del calendario, che finora era vuoto:
select started_at::text, connections_found, connections_synced, connections_failed, status
from google_calendar_sync_log order by started_at desc limit 5;
-- atteso: almeno una riga, con connections_found = 3.


-- ────────────────────────────────────────────────────────────────────────────
-- 4. ALTERNATIVA, se ALTER DATABASE non fosse concesso dal piano Supabase
--
--    Si riscrive il comando di ogni job mettendo URL e chiave in chiaro,
--    come fa gia' google-calendar-renew-watches-6h. Meno elegante: 14 punti
--    da aggiornare invece di uno. Esempio per il calendario:
-- ────────────────────────────────────────────────────────────────────────────
-- select cron.alter_job(30, command := $cmd$
--   SELECT net.http_post(
--     url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/google-calendar-sync',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYnJndWhrb2RnbnFmb21yZXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODQzODYsImV4cCI6MjA4OTk2MDM4Nn0.aHzsPcf09M0PYUmFqmJwZWiyoNjM2shWL12sHHUGSZc'
--     ),
--     body := '{"action": "cron-full-sync"}'::jsonb
--   );
-- $cmd$);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. DA DECIDERE DOPO — i 6 job disattivati
--
--    Erano probabilmente spenti proprio perche' fallivano. Con il fix
--    tornerebbero a funzionare, ma vanno riaccesi uno per uno valutando se
--    servono ancora. NON riaccenderli in blocco.
-- ────────────────────────────────────────────────────────────────────────────
select jobid, jobname, schedule
from cron.job
where command like '%current_setting(''app.%' and not active
order by jobname;
-- apple-calendar-sync-every-10min, render-economics-monitor-hourly,
-- whatsapp-ai-recovery, fatt-zero-touch-orchestrator-tick,
-- ai-auto-execute-pending, ai-workflow-engine
