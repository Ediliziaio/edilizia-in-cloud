-- Migration: admin_dashboard_summary materialized view
-- Aggregates key dashboard metrics to avoid N+1 queries
-- Refreshed every 15 minutes via pg_cron

CREATE MATERIALIZED VIEW IF NOT EXISTS public.admin_dashboard_summary AS
WITH company_counts AS (
  SELECT
    COUNT(*) AS total_companies,
    COUNT(*) FILTER (WHERE status = 'active') AS active_companies,
    COUNT(*) FILTER (WHERE status = 'trial') AS trial_companies,
    COUNT(*) FILTER (WHERE status = 'suspended') AS suspended_companies,
    COUNT(*) FILTER (WHERE status = 'expired') AS expired_companies,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_companies_30d,
    COUNT(*) FILTER (WHERE status = 'suspended' AND updated_at >= NOW() - INTERVAL '30 days') AS churned_companies_30d
  FROM public.companies
),
mrr_data AS (
  SELECT
    COALESCE(SUM(sp.price_monthly), 0) AS mrr_eur
  FROM public.companies c
  JOIN public.subscription_plans sp ON c.subscription_plan_id = sp.id
  WHERE c.status = 'active'
),
trial_conv AS (
  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE status IN ('active', 'trial')) = 0 THEN 0
      ELSE ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'active') /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('active', 'trial', 'expired', 'suspended')), 0),
        1
      )
    END AS trial_conversion_rate
  FROM public.companies
  WHERE created_at >= NOW() - INTERVAL '90 days'
),
support_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) AS open_support_tickets
  FROM public.support_conversations
),
user_count AS (
  SELECT COUNT(*) AS total_users
  FROM public.user_roles
  WHERE role = 'customer'
)
SELECT
  1 AS row_id,
  cc.total_companies,
  cc.active_companies,
  cc.trial_companies,
  cc.suspended_companies,
  cc.expired_companies,
  cc.new_companies_30d,
  cc.churned_companies_30d,
  m.mrr_eur,
  ROUND(m.mrr_eur * 12, 2) AS arr_eur,
  tc.trial_conversion_rate,
  ss.open_support_tickets,
  uc.total_users,
  NOW() AS calculated_at
FROM company_counts cc
CROSS JOIN mrr_data m
CROSS JOIN trial_conv tc
CROSS JOIN support_stats ss
CROSS JOIN user_count uc;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_dashboard_summary_singleton
  ON public.admin_dashboard_summary(row_id);

-- RLS: only via service_role (edge function reads it)
-- No direct client access needed

-- Schedule refresh every 15 minutes via pg_cron (if pg_cron is available)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'refresh-admin-dashboard-summary',
      '*/15 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_dashboard_summary'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$do$;
