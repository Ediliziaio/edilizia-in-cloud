-- 2026-05-27: ottimizzazioni DB perf da audit.
-- Top 5 hit p95 nella stat_statements (get_dashboard_kpis 222s/day,
-- get_marketing_dashboard_stats 43s/day, get_vendor_trend_mensile 1.36s
-- mean) — risolti con STABLE marker + indici compositi + dedup.

-- 1) Plan caching: VOLATILE → STABLE → PostgREST cachea il plan
ALTER FUNCTION public.get_dashboard_kpis(uuid, timestamptz, timestamptz, uuid) STABLE;

-- 2) Dedup indici marketing_contacts (2 identici su company_id)
DROP INDEX IF EXISTS public.idx_marketing_contacts_company;
DROP INDEX IF EXISTS public.marketing_contacts_company_idx;

-- 3) Drop indici 0-scan (≈14MB liberati, principalmente trgm email_inbox)
DROP INDEX IF EXISTS public.idx_email_inbox_raw_text_trgm;
DROP INDEX IF EXISTS public.idx_email_inbox_subject_trgm;
DROP INDEX IF EXISTS public.idx_company_kb_overrides_embedding;
DROP INDEX IF EXISTS public.idx_email_inbox_user_folder_received;

-- 4) Indici compositi per le 3 RPC più costose
CREATE INDEX IF NOT EXISTS idx_orders_company_status_created
  ON public.orders (company_id, current_status_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_opp_company_status_updated
  ON public.marketing_opportunities (company_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_opp_company_status_stage
  ON public.marketing_opportunities (company_id, status, stage_id)
  WHERE status = 'open' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_opp_assigned_updated
  ON public.marketing_opportunities (company_id, assigned_to, updated_at)
  WHERE assigned_to IS NOT NULL AND deleted_at IS NULL;

-- 5) admin_dashboard_summary refresh 15min → 60min
DO $$
DECLARE _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'refresh-admin-dashboard-summary';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.alter_job(_jobid, schedule := '0 * * * *');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cron.alter_job failed: %', SQLERRM;
END $$;
