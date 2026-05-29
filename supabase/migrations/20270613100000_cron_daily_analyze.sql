-- ════════════════════════════════════════════════════════════════════════════
-- DB VELOCITY · ANALYZE giornaliero (statistiche planner sempre fresche)
-- ────────────────────────────────────────────────────────────────────────────
-- Causa misurata: le tabelle core a bassa scrittura (companies, profiles,
-- user_roles, company_branding, accountant_*) NON raggiungono mai la soglia di
-- autoanalyze (autovacuum_analyze_threshold=50 + 10% righe), quindi restano con
-- last_analyze NULL → il planner stima 0 righe → sceglie seq scan / join sbagliati.
-- Un ANALYZE schedulato a notte (cheap: tabelle piccole) tiene le stime corrette.
-- Sicuro: ANALYZE prende solo ShareUpdateExclusiveLock, non blocca letture/scritture.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-analyze-public') THEN
    PERFORM cron.unschedule('daily-analyze-public');
  END IF;
  PERFORM cron.schedule('daily-analyze-public', '30 2 * * *', 'ANALYZE');
END $$;
