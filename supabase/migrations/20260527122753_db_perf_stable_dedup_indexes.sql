-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- 2026-05-27: ottimizzazioni DB perf da audit.
--
-- 1) get_dashboard_kpis: VOLATILE → STABLE. Abilita plan caching
--    PostgREST. Stima -20/40ms su 1306 chiamate/giorno = ~30s/giorno.
ALTER FUNCTION public.get_dashboard_kpis(uuid, timestamptz, timestamptz, uuid) STABLE;

-- 2) DROP indici duplicati su marketing_contacts (company_id puro).
--    Mantengo idx_marketing_contacts_company_created (più completo) +
--    idx_marketing_contacts_active (partial WHERE deleted_at IS NULL).
DROP INDEX IF EXISTS public.idx_marketing_contacts_company;
DROP INDEX IF EXISTS public.marketing_contacts_company_idx;

-- 3) DROP indici 0 scan (idx_scan=0 in pg_stat_user_indexes).
--    11MB liberi per il trgm email_inbox + altri minori.
DROP INDEX IF EXISTS public.idx_email_inbox_raw_text_trgm;
DROP INDEX IF EXISTS public.idx_email_inbox_subject_trgm;
DROP INDEX IF EXISTS public.idx_company_kb_overrides_embedding;
DROP INDEX IF EXISTS public.idx_email_inbox_user_folder_received;

-- 4) Rallenta refresh admin_dashboard_summary 15min → 60min.
--    Stima -5min CPU/giorno + meno lock matview.
DO $$
DECLARE _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'refresh-admin-dashboard-summary';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.alter_job(_jobid, schedule := '0 * * * *');
    RAISE NOTICE 'admin_dashboard_summary cron: rescheduled to hourly';
  ELSE
    RAISE NOTICE 'admin_dashboard_summary cron: job not found, skip';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cron.alter_job failed: %', SQLERRM;
END $$;
