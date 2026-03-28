-- =============================================
-- 3. SLA fields on subscription_plans
-- =============================================
ALTER TABLE public.subscription_plans 
  ADD COLUMN IF NOT EXISTS sla_response_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS sla_resolution_hours integer DEFAULT 72;
