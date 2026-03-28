CREATE VIEW public.monthly_billing_summary WITH (security_invoker = true) AS
  SELECT u.company_id,
    c.name AS company_name,
    date_trunc('month', u.created_at) AS month,
    count(*) AS conversations_count,
    sum(u.duration_min) AS total_minutes,
    sum(u.cost_real_total) AS total_cost_real_eur,
    sum(u.cost_billed_total) AS total_cost_billed_eur,
    sum(u.margin_total) AS total_margin_eur,
    round(avg(u.cost_billed_per_min), 6) AS avg_cost_per_min,
    count(DISTINCT u.agent_id) AS agents_used
  FROM public.ai_credit_usage u
  JOIN public.companies c ON c.id = u.company_id
  GROUP BY u.company_id, c.name, date_trunc('month', u.created_at);
