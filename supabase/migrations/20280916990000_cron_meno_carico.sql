-- ════════════════════════════════════════════════════════════════════════════
-- Cron: meno carico, e non tutti allo scoccare dell'ora
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ
-- Il 15/09/2026 il database è andato più volte in blocco: connessioni in timeout
-- e job pg_cron durati 10-14 minuti invece di un secondo (max 878 s nelle 24 ore).
-- Il compute è passato da Micro a Medium (120 connessioni), ma il carico dei cron
-- restava quello:
--   · 131 job attivi, ~15.200 esecuzioni al giorno (calcolate dagli schedule;
--     job_run_details delle ultime 24 ore conferma: 1.430 per i job al minuto);
--   · 65 job partono al minuto :00 e 41 al minuto :30. Al minuto :00 cadevano
--     ~720 esecuzioni al giorno, contro una media di ~250 per minuto. Gli errori
--     di connessione arrivano sempre al minuto :00.
-- Molti job interrogano ogni minuto code che non hanno mai avuto una riga.
--
-- COSA FA
-- Solo cron.alter_job, mai unschedule: tutto si rimette com'era con un
-- alter_job(schedule := <prima>) o active := true. Nessun comando cambia.
-- Uno schedule si tocca solo se è ancora quello visto il 15/09 (o è già quello
-- nuovo): se nel frattempo qualcuno l'ha cambiato, il job resta com'è e lo si
-- vede in un NOTICE. Rilanciare la migrazione non cambia nulla.
--
-- Esecuzioni al giorno: ~15.185 → ~10.000 (-34%).
-- Al minuto :00 da ~720 a 96 (restano process-automation-queue ogni minuto e i
-- job ogni 2 minuti); al minuto più carico dopo la modifica ~240.
--
-- ── 1. SPENTI (active := false) ─────────────────────────────────────────────
-- job                             prima          perché
-- postgres-warmup-3min            */3            warmup_postgres_pool() è un
--                                                SELECT 1: 480 esecuzioni/giorno
--                                                che non scaldano nulla (PostgREST
--                                                non passa da pg_cron).
-- customer-os-drift-check-weekly  0 8 * * 1      il comando è un SELECT 1 da una
--                                                vista, con un commento «in futuro».
-- process-campaign-retries        7-59/15        campaign_retry_log: 0 righe. La
--                                                scrive solo internal-campaign-manager,
--                                                che nessuno chiama (0 righe in
--                                                internal_outbound_campaigns), e
--                                                nessuno legge lo stato 'retry_due'
--                                                che il job imposta.
--
-- ── 2. RALLENTATI (code vuote o quasi) ──────────────────────────────────────
-- job                               prima     dopo        prove
-- silvio-action-runner              * * * *   1-59/10     silvio_action_queue: 0 righe
--                                                         da sempre. La sentinella
--                                                         segnala ritardi oltre 15 min:
--                                                         10 resta sotto.
-- social-publish-scheduler          * * * *   2-59/5      45 post da sempre, tutti
--                                                         pubblicati, 0 programmati nel
--                                                         futuro. 5 minuti di precisione
--                                                         bastano per un post.
-- silvio-outbound-worker-3min       */3       3-59/5      silvio_outbound_messages: 0
--                                                         righe. Non 10 minuti: i tool
--                                                         di Silvio (componi_e_invia,
--                                                         rispondi_a_email) accodano e
--                                                         non avviano il worker, quindi
--                                                         il cron è l'unico a spedire.
-- email-poll-inbox                  */2       1-59/5      2 caselle con polling attivo,
--                                                         poll_interval_minutes = 10:
--                                                         email_oauth_list_due_for_poll
--                                                         ne restituisce una ogni 10
--                                                         minuti. Girare ogni 2 era vuoto
--                                                         4 volte su 5.
-- email-ai-l1-classify-2min         */2       2-59/5      email_inbox ultimi 7 giorni:
-- email-ai-embed-2min               */2       3-59/5      4-43 email al giorno (1-2
-- email-ai-l3-batch-3min            */3       4-59/5      aziende). La catena resta in
--                                                         ordine: poll :01, L1 :02,
--                                                         embed :03, L3 :04.
-- meta-leads-backfill-5min          3-59/5    13-59/15    rete di sicurezza: nei 7 giorni
--                                                         il webhook ha portato 800 eventi
--                                                         Meta, tutti processati. La
--                                                         funzione stessa si descrive
--                                                         «cron ogni 15 min».
-- silvio-admin-alerts-runner-15min  */15      14,44       9 allarmi in 30 giorni, 13,5 s
--                                                         di media a giro. NON ogni ora:
--                                                         la regola «demo request» guarda
--                                                         gli ultimi 30 minuti, ogni ora
--                                                         ne perderebbe metà. Con 30 min
--                                                         la regola «errori AI» (finestra
--                                                         15 min) copre metà del tempo.
-- apple-calendar-sync-every-10min   */10      17,47       apple_calendar_connections: 0.
--                                                         NON spento: acceso apposta il
--                                                         02/09 (20280902040000) perché
--                                                         il calendario non si aggiorni
--                                                         solo a mano, e la connessione
--                                                         è disponibile nelle impostazioni.
-- automation-bulk-scheduler-runner  2-59/5    9-59/10     0 flussi con bulk_trigger_config,
--                                                         0 righe in bulk_scheduler_runs.
--                                                         NON spento: il wizard è in
--                                                         Impostazioni → Notifiche e in
--                                                         Automazioni; il runner rispetta
--                                                         next_run_at, quindi al massimo
--                                                         10 minuti di ritardo.
--
-- ── 3. SFALSATI (stessa cadenza, minuto diverso) ────────────────────────────
-- Sotto l'ora:
--   meta-crm-conversion-sync-10min */10 → 6-59/10   openwa-riconcilia-stati */10 → 5-59/10
--   outreach-dispatch */10 → 8-59/10                openwa-campagna-dispatch */10 5-20 → 2-59/10 5-20
--   auto-topup-check */15 → 1-59/15                 cron-health-check-15min */15 → 5-59/15
--   refresh-company-metrics */15 → 10-59/15         campo-geocodifica-cantieri */20 → 16-59/20
--   refresh-analytics-sede */30 → 19,49             silvio_detect_30min */30 → 22,52
--   email-ai-dispatch-opportunita-5min */5 → 2-59/5 whatsapp-ai-recovery */5 → 3-59/5
--   email-ai-dispatch-fatture-7min */7 → 3-59/7 (*/7 ricade a :00 ogni ora)
-- Orari e ogni 6 ore:
--   refresh-admin-dashboard-summary 0 → 26          refresh-pnl-view 0 → 46
--   google-calendar-renew-watches-6h 0 */6 → 5 */6
-- Giornalieri, settimanali, mensili: stessa ora UTC, qualche minuto dopo (o
-- prima, dove nessuno aspetta l'orario). I giri che contano per chi li riceve
-- slittano di 2-8 minuti al massimo:
--   02: brain-age-facts 00→03, cleanup-capture-orphans 00→06, gps-positions-cleanup 00→09,
--       daily-analyze-public 30→14 (dopo le pulizie, prima del backup),
--       process-dunning-daily 30→36
--   03: cleanup-cestino-14gg 00→02, crm-score-decay 00→05, email_otp_cleanup 00→08,
--       meta-token-refresh 00→11, mkt-ritara-soglie (lun) 00→13, silvio-uploads-cleanup 00→21,
--       cleanup-cestino-article-families 30→33, mkt-calcola-metriche 30→36
--   04: clienti-marketing-mattino 00→02, health-score-attivita 00→05,
--       silvio_memory_extract 00→08, morning-briefing-capomastri 30→32, crm-refresh-cold-lists 30→35
--   05: clienti-marketing-mattino-inverno 00→02, ops-canarino-daily 00→03,
--       customer-os-sofia-onboarding 00→07, billing-auto-sync-morning 00→14,
--       bank-eb-nightly-sync 30→18, customer-os-beatrice-kpi 30→24,
--       task-due-notifications 30→27, silvio_briefing_morning 30→32
--   05,06 (lun-sab): campo-digest-ufficio 30→38
--   06: bank-auto-reconcile 00→02 (dopo bank-eb 05:18), quote-expiry-reminder 00→03,
--       silvio-admin-briefing 00→05, meta-health-check 00→08, kb-sync-external-sources 00→12,
--       customer-os-tommaso-insight 00→24, ops-riepilogo-settimanale (lun) 00→26,
--       ops-riepilogo-mensile (giorno 1) 30→33
--   07: check-scheduled-triggers 00→02, cliente-rate-promemoria 00→03,
--       silvio-morning-brief 00→05, ai-proactive-proposals 00→08,
--       customer-os-tommaso-upsell (lun) 00→11, hr-check-scadenze 30→34
--   08: check-scadenze-documenti 00→03, generate-recurring-costs (giorno 1) 00→05,
--       referral-monthly-cycle (giorno 1) 00→09
--   09 (giorno 12): referral-payout-executor 00→04
--   11: billing-auto-sync-afternoon 00→04      16: auto-genera-giornale 00→04
--   15,16 (lun-sab): campo-promemoria-uscita 30→36
--   16,17 (lun-sab): campo-promemoria-rapportino 30→39
--
-- Vincoli verificati prima di spostare:
--   · ops-canarino in modo clienti-marketing confronta solo l'ORA di Roma
--     (oraDiRoma() === ora_roma): i minuti non cambiano quale dei due giri parte.
--   · campo_promemoria() sceglie lo slot con finestre 17:30-17:59, 18:30-18:59,
--     07:30-07:59 ora di Roma: i nuovi minuti (:36, :38, :39) restano dentro.
--   · mkt-calcola-metriche (03:36) alimenta mkt_rapporto_mattino letto da
--     clienti-marketing-mattino (04:02): resta prima. mkt-motore-regole parte
--     solo alle 05:50, dopo il rapporto, quindi il giro delle 03:30 NON è doppio.
--   · company-backup-settimanale resta a domenica 02:30: l'orario è scritto in
--     CLAUDE.md. Si spostano ANALYZE e dunning che gli partivano insieme.
--   · sentinelle_effetti_cron elenca i cron spenti come 'cron_spento'; l'esito era
--     già quello (render-economics-monitor-hourly, task-riepilogo-email-daily),
--     quindi nessuna notifica nuova.
--
-- ── 4. NON TOCCATI, apposta ─────────────────────────────────────────────────
--   process-automation-queue (ogni minuto): i tempi delle automazioni contano.
--   meta-process-leads-queue (*/2): trasforma i lead in contatti.
--   battito-esterno-2min / battito-verifica-2min: la sonda misura proprio questo.
--   silvio-generation-worker-2min: 0 job da sempre, ma SilvioImageJob.tsx
--     interroga il job ogni 2,5 s con l'utente davanti, e i tool che accodano
--     (silvio_tool_enqueue_creativita, silvio_tool_genera_documento_router) non
--     avviano il worker: a 10 minuti l'immagine aspetterebbe fino a 10 minuti.
--   ai-voice-outbound-leads (1-59/5): ai_agents_v2 = 0, ai_phone_numbers_v2 = 0,
--     richiamo_a_caldo_attivo = false (la funzione esce dopo una lettura). Ma
--     l'interruttore in RichiamoACaldoTab scrive solo platform_settings: col cron
--     spento, accenderlo non farebbe partire nulla, senza avvisare. Già fuori da :00.
--   email-ai-dispatch-opportunita-5min / -fatture-7min: il token esadecimale
--     scritto in chiaro nel comando va spostato nel Vault in una migrazione a parte
--     (qui cambia solo il minuto, il comando no).
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  r record;
  v_id bigint;
  v_schedule text;
  v_active boolean;
BEGIN
  -- 1. Spenti
  FOR r IN
    SELECT unnest(ARRAY[
      'postgres-warmup-3min',
      'customer-os-drift-check-weekly',
      'process-campaign-retries'
    ]) AS jobname
  LOOP
    SELECT jobid, active INTO v_id, v_active FROM cron.job WHERE jobname = r.jobname;
    IF v_id IS NULL THEN
      RAISE NOTICE 'cron_meno_carico: % non esiste, salto', r.jobname;
    ELSIF v_active THEN
      PERFORM cron.alter_job(job_id := v_id, active := false);
    END IF;
  END LOOP;

  -- 2 e 3. Rallentati e sfalsati: (job, schedule visto il 15/09, schedule nuovo)
  FOR r IN
    SELECT * FROM (VALUES
      -- rallentati
      ('silvio-action-runner',                  '* * * * *',          '1-59/10 * * * *'),
      ('social-publish-scheduler',              '* * * * *',          '2-59/5 * * * *'),
      ('silvio-outbound-worker-3min',           '*/3 * * * *',        '3-59/5 * * * *'),
      ('email-poll-inbox',                      '*/2 * * * *',        '1-59/5 * * * *'),
      ('email-ai-l1-classify-2min',             '*/2 * * * *',        '2-59/5 * * * *'),
      ('email-ai-embed-2min',                   '*/2 * * * *',        '3-59/5 * * * *'),
      ('email-ai-l3-batch-3min',                '*/3 * * * *',        '4-59/5 * * * *'),
      ('meta-leads-backfill-5min',              '3-59/5 * * * *',     '13-59/15 * * * *'),
      ('silvio-admin-alerts-runner-15min',      '*/15 * * * *',       '14,44 * * * *'),
      ('apple-calendar-sync-every-10min',       '*/10 * * * *',       '17,47 * * * *'),
      ('automation-bulk-scheduler-runner',      '2-59/5 * * * *',     '9-59/10 * * * *'),
      -- sfalsati sotto l'ora
      ('meta-crm-conversion-sync-10min',        '*/10 * * * *',       '6-59/10 * * * *'),
      ('openwa-riconcilia-stati',               '*/10 * * * *',       '5-59/10 * * * *'),
      ('outreach-dispatch',                     '*/10 * * * *',       '8-59/10 * * * *'),
      ('openwa-campagna-dispatch',              '*/10 5-20 * * *',    '2-59/10 5-20 * * *'),
      ('auto-topup-check',                      '*/15 * * * *',       '1-59/15 * * * *'),
      ('cron-health-check-15min',               '*/15 * * * *',       '5-59/15 * * * *'),
      ('refresh-company-metrics',               '*/15 * * * *',       '10-59/15 * * * *'),
      ('campo-geocodifica-cantieri',            '*/20 * * * *',       '16-59/20 * * * *'),
      ('refresh-analytics-sede',                '*/30 * * * *',       '19,49 * * * *'),
      ('silvio_detect_30min',                   '*/30 * * * *',       '22,52 * * * *'),
      ('email-ai-dispatch-opportunita-5min',    '*/5 * * * *',        '2-59/5 * * * *'),
      ('whatsapp-ai-recovery',                  '*/5 * * * *',        '3-59/5 * * * *'),
      ('email-ai-dispatch-fatture-7min',        '*/7 * * * *',        '3-59/7 * * * *'),
      -- orari e ogni 6 ore
      ('refresh-admin-dashboard-summary',       '0 * * * *',          '26 * * * *'),
      ('refresh-pnl-view',                      '0 * * * *',          '46 * * * *'),
      ('google-calendar-renew-watches-6h',      '0 */6 * * *',        '5 */6 * * *'),
      -- 02 UTC
      ('brain-age-facts-daily',                 '0 2 * * *',          '3 2 * * *'),
      ('cleanup-capture-orphans-daily',         '0 2 * * *',          '6 2 * * *'),
      ('gps-positions-cleanup',                 '0 2 * * *',          '9 2 * * *'),
      ('daily-analyze-public',                  '30 2 * * *',         '14 2 * * *'),
      ('process-dunning-daily',                 '30 2 * * *',         '36 2 * * *'),
      -- 03 UTC
      ('cleanup-cestino-14gg',                  '0 3 * * *',          '2 3 * * *'),
      ('crm-score-decay-daily',                 '0 3 * * *',          '5 3 * * *'),
      ('email_otp_cleanup',                     '0 3 * * *',          '8 3 * * *'),
      ('meta-token-refresh-daily',              '0 3 * * *',          '11 3 * * *'),
      ('mkt-ritara-soglie',                     '0 3 * * 1',          '13 3 * * 1'),
      ('silvio-uploads-cleanup-daily',          '0 3 * * *',          '21 3 * * *'),
      ('cleanup-cestino-article-families-15gg', '30 3 * * *',         '33 3 * * *'),
      ('mkt-calcola-metriche',                  '30 3 * * *',         '36 3 * * *'),
      -- 04 UTC
      ('clienti-marketing-mattino',             '0 4 * * *',          '2 4 * * *'),
      ('health-score-attivita',                 '0 4 * * *',          '5 4 * * *'),
      ('silvio_memory_extract_nightly',         '0 4 * * *',          '8 4 * * *'),
      ('morning-briefing-capomastri-daily',     '30 4 * * *',         '32 4 * * *'),
      ('crm-refresh-cold-lists',                '30 4 * * *',         '35 4 * * *'),
      -- 05 UTC
      ('clienti-marketing-mattino-inverno',     '0 5 * * *',          '2 5 * * *'),
      ('ops-canarino-daily',                    '0 5 * * *',          '3 5 * * *'),
      ('customer-os-sofia-onboarding-daily',    '0 5 * * *',          '7 5 * * *'),
      ('billing-auto-sync-morning',             '0 5 * * *',          '14 5 * * *'),
      ('bank-eb-nightly-sync',                  '30 5 * * *',         '18 5 * * *'),
      ('customer-os-beatrice-kpi-daily',        '30 5 * * *',         '24 5 * * *'),
      ('task-due-notifications-daily',          '30 5 * * *',         '27 5 * * *'),
      ('silvio_briefing_morning',               '30 5 * * *',         '32 5 * * *'),
      ('campo-digest-ufficio',                  '30 5,6 * * 1-6',     '38 5,6 * * 1-6'),
      -- 06 UTC
      ('bank-auto-reconcile-nightly',           '0 6 * * *',          '2 6 * * *'),
      ('quote-expiry-reminder',                 '0 6 * * *',          '3 6 * * *'),
      ('silvio-admin-briefing-daily',           '0 6 * * *',          '5 6 * * *'),
      ('meta-health-check-daily',               '0 6 * * *',          '8 6 * * *'),
      ('kb-sync-external-sources-daily',        '0 6 * * *',          '12 6 * * *'),
      ('customer-os-tommaso-insight-daily',     '0 6 * * *',          '24 6 * * *'),
      ('ops-riepilogo-settimanale',             '0 6 * * 1',          '26 6 * * 1'),
      ('ops-riepilogo-mensile',                 '30 6 1 * *',         '33 6 1 * *'),
      -- 07 UTC
      ('check-scheduled-triggers-daily',        '0 7 * * *',          '2 7 * * *'),
      ('cliente-rate-promemoria',               '0 7 * * *',          '3 7 * * *'),
      ('silvio-morning-brief-daily',            '0 7 * * *',          '5 7 * * *'),
      ('ai-proactive-proposals-daily',          '0 7 * * *',          '8 7 * * *'),
      ('customer-os-tommaso-upsell-weekly',     '0 7 * * 1',          '11 7 * * 1'),
      ('hr-check-scadenze-daily',               '30 7 * * *',         '34 7 * * *'),
      -- 08-16 UTC
      ('check-scadenze-documenti-daily',        '0 8 * * *',          '3 8 * * *'),
      ('generate-recurring-costs-monthly',      '0 8 1 * *',          '5 8 1 * *'),
      ('referral-monthly-cycle',                '0 8 1 * *',          '9 8 1 * *'),
      ('referral-payout-executor',              '0 9 12 * *',         '4 9 12 * *'),
      ('billing-auto-sync-afternoon',           '0 11 * * *',         '4 11 * * *'),
      ('auto-genera-giornale-daily',            '0 16 * * *',         '4 16 * * *'),
      ('campo-promemoria-uscita',               '30 15,16 * * 1-6',   '36 15,16 * * 1-6'),
      ('campo-promemoria-rapportino',           '30 16,17 * * 1-6',   '39 16,17 * * 1-6')
    ) AS t(jobname, prima, dopo)
  LOOP
    SELECT jobid, schedule INTO v_id, v_schedule FROM cron.job WHERE jobname = r.jobname;
    IF v_id IS NULL THEN
      RAISE NOTICE 'cron_meno_carico: % non esiste, salto', r.jobname;
    ELSIF v_schedule = r.dopo THEN
      NULL; -- già fatto
    ELSIF v_schedule = r.prima THEN
      PERFORM cron.alter_job(job_id := v_id, schedule := r.dopo);
    ELSE
      RAISE NOTICE 'cron_meno_carico: % ha schedule «%», atteso «%»: non lo tocco',
        r.jobname, v_schedule, r.prima;
    END IF;
  END LOOP;
END $$;
