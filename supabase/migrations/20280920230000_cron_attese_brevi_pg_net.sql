-- ════════════════════════════════════════════════════════════════════════════
-- Cron: attese brevi per pg_net
-- ════════════════════════════════════════════════════════════════════════════
--
-- Applicata il 20/09/2026, DOPO il deploy delle otto funzioni dell'elenco
-- `rapide`: l'ordine conta, perché a una funzione ancora lenta l'attesa corta
-- toglierebbe il worker a metà lavoro.
--
-- PERCHÉ
-- Il 20/09/2026 la coda HTTP di pg_net si fermava fino a due minuti più volte
-- all'ora. pg_net ha un solo worker che elabora un lotto dentro UNA transazione
-- (src/worker.c, così fino alla 0.20.5): finché la richiesta più lenta non ha
-- risposto, nessuna risposta del lotto è visibile e il lotto dopo non parte.
-- L'attesa scritta nel job è quindi la durata massima del blocco, per tutti.
--
-- I colpevoli erano due funzioni lente, non il DNS:
--   · outreach-imap-poll, oltre 120 s a ogni giro (90 caselle IMAP in fila),
--     ai minuti 6/21/36/51 — gli stessi minuti dei timeout;
--   · meta-leads-backfill, 90-120 s (p50 90,7 s su 96 giri).
-- Il «DNS time: 120000 ms» di certi messaggi non era un DNS lento: pg_net lo
-- deduce da due contatori di curl che restano a zero quando la connessione è
-- riutilizzata, e lo stesso job alternava messaggi con e senza.
--
-- Accorciare l'attesa da sola non bastava: a connessione chiusa il runtime non
-- vede più né una richiesta né un waitUntil e ritira il worker a metà
-- (EarlyDrop, 24 volte su 24 in sei ore). outreach-imap-poll non completava un
-- giro dal 16/09 — 31 caselle mai lette, 24 ferme da oltre un giorno — e
-- nessuno lo vedeva, perché l'avviso degli errori e il registro dei giri stanno
-- in fondo al giro. Per questo le otto funzioni sono passate prima a
-- serveConMetricheRapida (_shared/withMetricsRapida.ts): a pg_net rispondono
-- entro 5 secondi e finiscono il lavoro sotto EdgeRuntime.waitUntil.
--
-- COSA FA
-- 1. Job delle funzioni `rapide`: attesa a 15.000 ms.
-- 2. Tutti gli altri job HTTP: tetto a 150.000 ms. Il gateway chiude comunque a
--    150 secondi con un 504, quindi i 300.000 e 600.000 ms di oggi non possono
--    vedere una risposta utile: servono solo a tenere fermo il lotto.
-- 3. outreach-imap-poll passa da ogni 15 minuti (6-59/15) a ogni 5 (4-59/5).
--    Ora il giro fa al massimo 25 caselle, dalle più vecchie: a 5 minuti le 90
--    caselle girano tutte in 20 minuti, cioè più spesso di prima — quando in
--    teoria erano 15 minuti e in pratica non finiva mai. Lo slot :4 è il meno
--    carico fra quelli a 5 minuti.
-- Del comando cambia solo il numero dopo `timeout_milliseconds :=`; il comando
-- non viene mai stampato né copiato (contiene header). Nei NOTICE finiscono
-- solo nome del job, funzione e millisecondi. Un'attesa già uguale o più corta
-- non si tocca: rilanciare non cambia nulla. Per tornare indietro,
-- cron.alter_job col numero di prima (i NOTICE lo dicono).
--
-- COSA RESTA FUORI, apposta
--   · I job senza timeout_milliseconds: usano i 5 secondi predefiniti di
--     pg_net, già corti. Vale anche per il ponte silvio_invoke_edge.
--   · Le funzioni SQL che chiamano pg_net con attese lunghe —
--     billing_auto_sync_all (120 s, una POST per integrazione),
--     silvio_email_dispatch_fatture (120 s), silvio_email_dispatch_opportunita
--     (60 s): prima vanno rese rapide billing-import, email-ai-estrai-allegato
--     ed email-ai-opportunita.
--   · Le funzioni ancora lente, in ordine di peso sulla coda (secondi al giorno
--     passati oltre i 5 s, da function_edge_logs): meta-ads-sync-insights (396,
--     p50 66 s), meta-diagnostica-messaggi (94), auto-genera-giornale-cantiere
--     (66), elena-cs-health-daily (64). Si aggiungono a `rapide` man mano che
--     passano a serveConMetricheRapida.
--
-- ── PRIMA ───────────────────────────────────────────────────────────────────
-- I job con attesa lunga (solo nome, orario, attesa, funzione: mai il comando):
--
--   select j.jobname, j.schedule, j.active,
--          (regexp_match(j.command, 'timeout_milliseconds\s*:=\s*([0-9]+)', 'i'))[1]::int as attesa_ms,
--          substring(j.command from 'functions/v1/([A-Za-z0-9_-]+)') as funzione
--     from cron.job j
--    where j.command ~* 'net\.http_(post|get)'
--    order by 4 desc nulls last, 1;
--
-- Chi tiene ferma la coda davvero, in secondi al giorno (le durate vere):
--
--   select function_name, count(*) as giri,
--          round(percentile_disc(0.5) within group (order by latency_ms)/1000.0, 1) as p50_s,
--          round(max(latency_ms)/1000.0, 1) as max_s
--     from public.system_health_metrics
--    where metric_type = 'edge_function_call' and recorded_at > now() - interval '24 hours'
--    group by 1 having max(latency_ms) > 5000 order by 3 desc;
--
-- ── DOPO ────────────────────────────────────────────────────────────────────
-- Niente più buchi di due minuti (i minuti mancanti sono i blocchi):
--
--   select date_trunc('minute', created) as minuto, count(*) as risposte,
--          count(*) filter (where status_code is null) as scadute,
--          count(*) filter (where status_code = 202)   as in_background
--     from net._http_response
--    where created > now() - interval '2 hours'
--    group by 1 order by 1;
--
-- Le scadute, per durata dell'attesa (devono sparire le 120000):
--
--   select (regexp_match(error_msg, 'Timeout of ([0-9]+) ms'))[1] as attesa_ms,
--          extract(minute from created)::int % 15 as minuto_nel_quarto_dora, count(*)
--     from net._http_response
--    where created > now() - interval '6 hours' and status_code is null
--    group by 1, 2 order by 3 desc;
--
-- Le caselle outreach girano tutte (nessuna «mai», nessuna ferma da un giorno):
--
--   select count(*) filter (where last_imap_check_at is null) as mai,
--          count(*) filter (where last_imap_check_at < now() - interval '1 hour') as ferme_da_un_ora,
--          count(*) as totali
--     from public.outreach_sender_accounts
--    where provider = 'smtp' and status in ('active','warming')
--      and connection_status = 'ok' and imap_host is not null;
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
    'email-ai-l3-batch',
    'outreach-imap-poll',
    'meta-leads-backfill',
    'google-calendar-sync',
    'outreach-dispatch'
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

-- outreach-imap-poll: da ogni 15 minuti a ogni 5, così le 90 caselle girano
-- tutte in 20 minuti a lotti da 25. Si tocca solo se lo schedule è ancora
-- quello visto il 20/09 (o è già quello nuovo).
DO $$
DECLARE v_id bigint; v_schedule text;
BEGIN
  SELECT jobid, schedule INTO v_id, v_schedule FROM cron.job WHERE jobname = 'outreach-imap-poll';
  IF v_id IS NULL THEN
    RAISE NOTICE 'cron_attese_brevi: outreach-imap-poll non esiste, salto';
  ELSIF v_schedule = '4-59/5 * * * *' THEN
    NULL; -- già fatto
  ELSIF v_schedule = '6-59/15 * * * *' THEN
    PERFORM cron.alter_job(job_id := v_id, schedule := '4-59/5 * * * *');
    RAISE NOTICE 'cron_attese_brevi: outreach-imap-poll % → 4-59/5 * * * *', v_schedule;
  ELSE
    RAISE NOTICE 'cron_attese_brevi: outreach-imap-poll ha schedule «%», atteso «6-59/15 * * * *»: non lo tocco', v_schedule;
  END IF;
END $$;
