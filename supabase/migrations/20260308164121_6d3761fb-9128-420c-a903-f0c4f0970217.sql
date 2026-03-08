
-- FIX 1: AI Subscriptions table
CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trial',
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  price_eur numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: company members can read their own subscription
CREATE POLICY "Users can read own company ai_subscriptions"
  ON public.ai_subscriptions FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- RLS: only super_admin can modify
CREATE POLICY "Super admins can manage ai_subscriptions"
  ON public.ai_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- FIX 2: Add call_direction to ai_agent_conversations
ALTER TABLE public.ai_agent_conversations
  ADD COLUMN IF NOT EXISTS call_direction text NOT NULL DEFAULT 'inbound';

-- FIX 4: Add send_confirmation_after_booking to ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS send_confirmation_after_booking boolean NOT NULL DEFAULT true;
