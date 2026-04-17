-- Extend superadmin_service_pnl materialized view with a dedicated row per
-- month for the transactional email stream, sourced from the unified
-- email_delivery_log (which is the only place transactional email is recorded
-- — email_credits_log only captures wallet overage deductions and therefore
-- undercounts by-plan transactional sends that were within quota).

DROP MATERIALIZED VIEW IF EXISTS public.superadmin_service_pnl CASCADE;

CREATE MATERIALIZED VIEW public.superadmin_service_pnl AS
-- EMAIL MARKETING (wallet deductions from email_credits_log)
SELECT date_trunc('month', ecl.created_at)::DATE AS month,
       'email_marketing'::TEXT AS service,
       COUNT(*)::BIGINT AS units_sent,
       SUM(ABS(ecl.amount_eur))::NUMERIC AS revenue_eur,
       SUM(ABS(ecl.amount_eur) / NULLIF(ep.markup_multiplier, 0))::NUMERIC AS cost_eur,
       SUM(ABS(ecl.amount_eur) - ABS(ecl.amount_eur) / NULLIF(ep.markup_multiplier, 0))::NUMERIC AS margin_eur,
       ROUND(
         (SUM(ABS(ecl.amount_eur) - ABS(ecl.amount_eur) / NULLIF(ep.markup_multiplier, 0))
            / NULLIF(SUM(ABS(ecl.amount_eur)), 0)) * 100,
         2
       ) AS margin_pct
FROM public.email_credits_log ecl
CROSS JOIN LATERAL (
  SELECT markup_multiplier FROM public.email_pricing WHERE is_active = true LIMIT 1
) ep
WHERE ecl.type = 'deduct'
GROUP BY 1, 2

UNION ALL

-- EMAIL TRANSACTIONAL (per-send unified log — captures within-plan volume too)
SELECT date_trunc('month', edl.sent_at)::DATE AS month,
       'email_transactional'::TEXT AS service,
       COUNT(*)::BIGINT AS units_sent,
       COALESCE(SUM(edl.charged_eur), 0)::NUMERIC AS revenue_eur,
       COALESCE(SUM(edl.cost_eur), 0)::NUMERIC AS cost_eur,
       COALESCE(SUM(edl.charged_eur - edl.cost_eur), 0)::NUMERIC AS margin_eur,
       ROUND(
         (COALESCE(SUM(edl.charged_eur - edl.cost_eur), 0)
            / NULLIF(SUM(edl.charged_eur), 0)) * 100,
         2
       ) AS margin_pct
FROM public.email_delivery_log edl
WHERE edl.stream = 'transactional'
  AND edl.status IN ('sent', 'delivered')
GROUP BY 1, 2

UNION ALL

-- WHATSAPP
SELECT date_trunc('month', wcl.created_at)::DATE,
       'whatsapp'::TEXT,
       COUNT(*)::BIGINT,
       SUM(ABS(wcl.amount_eur))::NUMERIC,
       SUM(ABS(wcl.amount_eur) / NULLIF(wp.markup_multiplier, 0))::NUMERIC,
       SUM(ABS(wcl.amount_eur) - ABS(wcl.amount_eur) / NULLIF(wp.markup_multiplier, 0))::NUMERIC,
       ROUND(
         (SUM(ABS(wcl.amount_eur) - ABS(wcl.amount_eur) / NULLIF(wp.markup_multiplier, 0))
            / NULLIF(SUM(ABS(wcl.amount_eur)), 0)) * 100,
         2
       )
FROM public.whatsapp_credits_log wcl
CROSS JOIN LATERAL (
  SELECT markup_multiplier FROM public.whatsapp_pricing
  WHERE is_active = true AND category = 'marketing' LIMIT 1
) wp
WHERE wcl.type = 'deduct'
GROUP BY 1, 2

UNION ALL

-- AI AGENTS
SELECT date_trunc('month', acu.created_at)::DATE,
       'ai_agents'::TEXT,
       COUNT(*)::BIGINT,
       SUM(acu.cost_billed_total)::NUMERIC,
       SUM(acu.cost_real_total)::NUMERIC,
       SUM(acu.margin_total)::NUMERIC,
       ROUND(
         (SUM(acu.margin_total) / NULLIF(SUM(acu.cost_billed_total), 0)) * 100,
         2
       )
FROM public.ai_credit_usage acu
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pnl_month_service
  ON public.superadmin_service_pnl (month, service);

-- Re-register the refresh cron (idempotent — unschedule if already there)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-pnl-view');
EXCEPTION WHEN OTHERS THEN
  -- job didn't exist, fine
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-pnl-view',
  '0 * * * *',
  $refresh$REFRESH MATERIALIZED VIEW CONCURRENTLY public.superadmin_service_pnl$refresh$
);
