
-- Fix SECURITY DEFINER views: recreate as SECURITY INVOKER (default)
DROP VIEW IF EXISTS public.order_payment_summary;
CREATE VIEW public.order_payment_summary AS
  SELECT order_id,
    sum(amount) AS total_invoiced,
    sum(CASE WHEN is_paid THEN amount ELSE 0::numeric END) AS total_collected,
    sum(CASE WHEN NOT is_paid THEN amount ELSE 0::numeric END) AS total_pending,
    count(*) AS installment_count
  FROM public.order_installments
  GROUP BY order_id;

DROP VIEW IF EXISTS public.monthly_billing_summary;
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

-- Fix RLS-enabled-no-policy: add policy for edge_function_rate_limits
CREATE POLICY "Service role only" ON public.edge_function_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
