-- 2. Add previous_plan_id to subscription_logs
ALTER TABLE public.subscription_logs
  ADD COLUMN IF NOT EXISTS previous_plan_id UUID REFERENCES public.subscription_plans(id);
