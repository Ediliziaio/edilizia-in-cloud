-- Sprint 3 — P&L Engine: materialized view + cron refresh

CREATE MATERIALIZED VIEW IF NOT EXISTS public.superadmin_service_pnl AS
-- EMAIL (da email_credits_log con type='deduct')
SELECT date_trunc('month', ecl.created_at)::DATE AS month, 'email' AS service,
  COUNT(*) AS units_sent, SUM(ABS(ecl.amount_eur)) AS revenue_eur,
  SUM(ABS(ecl.amount_eur) / NULLIF(ep.markup_multiplier,0)) AS cost_eur,
  SUM(ABS(ecl.amount_eur) - ABS(ecl.amount_eur) / NULLIF(ep.markup_multiplier,0)) AS margin_eur,
  ROUND((SUM(ABS(ecl.amount_eur) - ABS(ecl.amount_eur) / NULLIF(ep.markup_multiplier,0))
    / NULLIF(SUM(ABS(ecl.amount_eur)),0)) * 100, 2) AS margin_pct
FROM public.email_credits_log ecl
CROSS JOIN (SELECT markup_multiplier FROM public.email_pricing WHERE is_active=true LIMIT 1) ep
WHERE ecl.type='deduct' GROUP BY 1,2
UNION ALL
-- WHATSAPP
SELECT date_trunc('month', wcl.created_at)::DATE, 'whatsapp',
  COUNT(*), SUM(ABS(wcl.amount_eur)),
  SUM(ABS(wcl.amount_eur) / NULLIF(wp.markup_multiplier,0)),
  SUM(ABS(wcl.amount_eur) - ABS(wcl.amount_eur) / NULLIF(wp.markup_multiplier,0)),
  ROUND((SUM(ABS(wcl.amount_eur) - ABS(wcl.amount_eur)/NULLIF(wp.markup_multiplier,0))
    /NULLIF(SUM(ABS(wcl.amount_eur)),0))*100,2)
FROM public.whatsapp_credits_log wcl
CROSS JOIN (SELECT markup_multiplier FROM public.whatsapp_pricing
  WHERE is_active=true AND category='marketing' LIMIT 1) wp
WHERE wcl.type='deduct' GROUP BY 1,2
UNION ALL
-- AI AGENTS (usa cost_billed_total e margin_total dalla tabella)
SELECT date_trunc('month', acu.created_at)::DATE, 'ai_agents',
  COUNT(*), SUM(acu.cost_billed_total),
  SUM(acu.cost_real_total),
  SUM(acu.margin_total),
  ROUND((SUM(acu.margin_total) / NULLIF(SUM(acu.cost_billed_total),0))*100,2)
FROM public.ai_credit_usage acu
GROUP BY 1,2;

CREATE UNIQUE INDEX idx_pnl_month_service ON public.superadmin_service_pnl(month, service);

SELECT cron.schedule('refresh-pnl-view','0 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.superadmin_service_pnl');
