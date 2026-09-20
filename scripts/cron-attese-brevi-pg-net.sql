-- ════════════════════════════════════════════════════════════════════════════
-- Cron: attese brevi per pg_net  —  PRONTA, NON ANCORA APPLICATA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Sta in scripts/ e non in supabase/migrations/ apposta: il 20/09/2026 la
-- sessione che l'ha scritta non aveva l'MCP Supabase collegato, e un file di
-- migrazione non applicato fa diventare rosso il controllo «Supabase Preview»
-- (CLAUDE.md, «Migrazioni»). Per applicarla:
--   1. rileggere la sezione PRIMA qui sotto ed eseguire le due SELECT;
--   2. apply_migration col nome `cron_attese_brevi_pg_net` e il blocco DO;
--   3. riallineare la versione in supabase_migrations.schema_migrations;
--   4. salvare questo file come supabase/migrations/<versione>_cron_attese_brevi_pg_net.sql
--      (verificare prima che la versione sia libera) e toglierlo da scripts/.
--
-- PERCHÉ
-- Il 20/09/2026 la coda HTTP di pg_net si è fermata fino a 2 minuti più volte
-- all'ora: 2.073 risposte in 6 ore, 35 scadute, 25 delle quali dopo 120 secondi
-- e in molte «DNS time: 120000 ms». Circa 50 minuti su 6 ore con la coda ferma,
-- e dietro aspettavano tutti: process-automation (ogni minuto) e la sonda del
-- battito, che dopo 90 secondi senza risposta segna «fallito» anche se la
-- piattaforma sta benissimo.
--
-- Letto il sorgente di pg_net (0.20.0, e uguale fino alla 0.20.5, l'ultima):
--   · il worker è uno solo ed elabora un lotto dentro UNA transazione
--     (StartTransactionCommand → consuma il lotto → `while (running_handles > 0)`
--     → CommitTransactionCommand): finché la richiesta più lenta non finisce,
--     nessuna risposta del lotto è visibile e il lotto successivo non parte;
--   · l'unico limite di tempo è CURLOPT_TIMEOUT_MS = timeout_milliseconds. Non
--     c'è un limite separato per DNS o connessione: una risoluzione del nome che
--     resta appesa consuma l'attesa INTERA;
--   · pg_net.batch_size (200) e pg_net.ttl (6 ore) non c'entrano: il primo dice
--     quante richieste per lotto, il secondo per quanto si tengono le risposte.
--     Nessuna versione più recente toglie la transazione unica.
-- Quindi l'attesa scritta nel job È la durata massima del blocco, per tutti.
--
-- Il cron non legge la risposta («lancia e dimentica»), ma accorciare l'attesa a
-- una funzione che lavora a lungo ha due costi: il canarino conta come «timeout»
-- ogni risposta senza status (http_errori_24h), e un worker a cui il chiamante
-- ha chiuso la connessione finisce il lavoro quasi sempre (osservato il
-- 05/08/2026) ma senza garanzia. Per questo le funzioni lunghe passano prima a
-- serveConMetricheRapida (_shared/rispostaRapidaCron.ts): a pg_net rispondono
-- entro 5 secondi, il lavoro finisce sotto EdgeRuntime.waitUntil. SOLO DOPO il
-- loro job scende a 15 secondi. Ordine: prima la funzione, poi l'attesa.
--
-- COSA FA
-- Solo cron.alter_job sul comando, e del comando cambia solo il numero dopo
-- `timeout_milliseconds :=`. Il comando non viene mai stampato né copiato qui:
-- contiene header. Nei NOTICE finiscono solo nome del job, funzione e millisecondi.
--   1. Le funzioni dell'elenco `rapide` (già passate alla risposta rapida):
--      attesa a 15.000 ms.
--   2. Tutti gli altri job: tetto a 150.000 ms. Il gateway delle edge function
--      chiude comunque a 150 secondi con un 504: i 300.000 e 600.000 ms di oggi
--      non possono vedere una risposta utile, servono solo a tenere fermo il
--      lotto fino a dieci minuti quando il DNS resta appeso.
-- Un'attesa già uguale o più corta non si tocca: rilanciare non cambia nulla.
-- Per tornare indietro: cron.alter_job col numero di prima (i NOTICE lo dicono).
--
-- COSA RESTA FUORI, apposta
--   · I job senza timeout_milliseconds: usano i 5 secondi predefiniti di pg_net,
--     già corti. Vale anche per il ponte silvio_invoke_edge (11 job).
--   · Le funzioni SQL che chiamano pg_net con attese lunghe —
--     billing_auto_sync_all (120 s, una POST per integrazione),
--     silvio_email_dispatch_fatture (120 s), silvio_email_dispatch_opportunita
--     (60 s): prima vanno rese rapide billing-import, email-ai-estrai-allegato
--     ed email-ai-opportunita.
--   · Le altre funzioni frequenti che lavorano a lungo: si aggiungono a `rapide`
--     man mano che passano a serveConMetricheRapida. In ordine di peso sulla
--     coda: process-automation (ogni minuto, 60 s; la presa in carico è atomica
--     dal 19/09, quindi due giri sovrapposti non raddoppiano i passi),
--     meta-process-leads (ogni 2 minuti), social-publish-scheduler,
--     retry-failed-webhooks, process-scheduled-campaigns, google-calendar-sync,
--     meta-crm-conversion-sync, automation-bulk-scheduler-runner; poi le
--     giornaliere (ai-proactive-proposals-daily, kb-sync-external-sources,
--     siti-metriche-sync, process-dunning, company-backup, silvio-morning-brief,
--     meta-ads-sync-insights, resend-to-unopened, sync-stripe-mrr).
--
-- ── PRIMA ───────────────────────────────────────────────────────────────────
-- I job con attesa lunga (SOLO nome, orario, attesa, funzione: mai il comando):
--
--   select j.jobname, j.schedule, j.active,
--          (regexp_match(j.command, 'timeout_milliseconds\s*:=\s*([0-9]+)', 'i'))[1]::int as attesa_ms,
--          substring(j.command from 'functions/v1/([A-Za-z0-9_-]+)') as funzione
--     from cron.job j
--    where j.command ~* 'net\.http_(post|get)'
--    order by 4 desc nulls last, 1;
--
-- Le durate vere per funzione (chi può entrare in `rapide` anche senza modifiche
-- perché risponde sempre in pochi secondi):
--
--   select function_name, count(*) as chiamate,
--          percentile_disc(0.5)  within group (order by latency_ms) as p50_ms,
--          percentile_disc(0.95) within group (order by latency_ms) as p95_ms,
--          max(latency_ms) as max_ms
--     from public.system_health_metrics
--    where metric_type = 'edge_function_call' and recorded_at > now() - interval '7 days'
--    group by 1 order by p95_ms desc nulls last;
--
-- ── DOPO ────────────────────────────────────────────────────────────────────
-- Niente più buchi di 2 minuti (una riga per minuto; i minuti mancanti sono i blocchi):
--
--   select date_trunc('minute', created) as minuto, count(*) as risposte,
--          count(*) filter (where status_code is null) as scadute,
--          count(*) filter (where status_code = 202)   as in_background
--     from net._http_response
--    where created > now() - interval '2 hours'
--    group by 1 order by 1;
--
-- Le scadute, per durata dell'attesa (devono sparire le 120000 e le 60000):
--
--   select (regexp_match(error_msg, 'Timeout of ([0-9]+) ms'))[1] as attesa_ms,
--          count(*) filter (where error_msg like '%DNS time%') as appese_al_dns, count(*)
--     from net._http_response
--    where created > now() - interval '6 hours' and status_code is null
--    group by 1 order by 3 desc;
--
-- La risposta rapida funziona se in Salute compaiono durate oltre i 5 secondi
-- per funzioni che a pg_net hanno risposto 202 — il lavoro è finito dopo:
--
--   select function_name, status_code, latency_ms, recorded_at
--     from public.system_health_metrics
--    where function_name in ('email-poll-inbox','email-ai-l1-classify','email-ai-embed-backfill','email-ai-l3-batch')
--      and latency_ms > 5000 and recorded_at > now() - interval '6 hours'
--    order by recorded_at desc limit 20;
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  r           record;
  v_attesa    int;
  v_obiettivo int;
  v_cambiati  int := 0;
  -- Il gateway delle edge function chiude a 150 s: oltre non arriva nulla di utile.
  c_tetto     constant int := 150000;
  -- Funzioni che a pg_net rispondono entro 5 s (serveConMetricheRapida).
  -- Una funzione entra qui solo DOPO essere stata pubblicata in quella forma.
  c_rapide    constant text[] := ARRAY[
    'email-poll-inbox',
    'email-ai-l1-classify',
    'email-ai-embed-backfill',
    'email-ai-l3-batch'
  ];
  c_attesa_rapide constant int := 15000;
BEGIN
  FOR r IN
    SELECT j.jobid, j.jobname, j.command,
           substring(j.command from 'functions/v1/([A-Za-z0-9_-]+)') AS funzione
      FROM cron.job j
     WHERE j.command ~* 'net\.http_(post|get)'
       AND j.command ~* 'timeout_milliseconds\s*:=\s*[0-9]+'
     ORDER BY j.jobname
  LOOP
    -- Due attese nello stesso comando: non si indovina quale sia di chi.
    IF (SELECT count(*) FROM regexp_matches(r.command, 'timeout_milliseconds\s*:=\s*[0-9]+', 'gi')) <> 1 THEN
      RAISE NOTICE 'cron_attese_brevi: % ha più di un''attesa nel comando: non lo tocco', r.jobname;
      CONTINUE;
    END IF;

    v_attesa    := (regexp_match(r.command, 'timeout_milliseconds\s*:=\s*([0-9]+)', 'i'))[1]::int;
    v_obiettivo := CASE WHEN r.funzione = ANY (c_rapide) THEN c_attesa_rapide ELSE c_tetto END;

    IF v_attesa <= v_obiettivo THEN
      CONTINUE; -- già corta (o già fatto)
    END IF;

    PERFORM cron.alter_job(
      job_id  := r.jobid,
      command := regexp_replace(r.command,
                                'timeout_milliseconds\s*:=\s*[0-9]+',
                                'timeout_milliseconds := ' || v_obiettivo,
                                'i'));
    v_cambiati := v_cambiati + 1;
    RAISE NOTICE 'cron_attese_brevi: % (%): % ms → % ms',
      r.jobname, COALESCE(r.funzione, 'senza funzione'), v_attesa, v_obiettivo;
  END LOOP;

  RAISE NOTICE 'cron_attese_brevi: % job aggiornati', v_cambiati;
END $$;
