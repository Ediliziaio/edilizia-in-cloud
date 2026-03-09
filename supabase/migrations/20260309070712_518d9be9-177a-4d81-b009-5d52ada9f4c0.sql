
-- =============================================
-- 1. Company Health Scores (server-side persistence)
-- =============================================
CREATE TABLE public.company_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  health text NOT NULL DEFAULT 'healthy',
  login_score integer NOT NULL DEFAULT 0,
  orders_score integer NOT NULL DEFAULT 0,
  features_score integer NOT NULL DEFAULT 0,
  team_score integer NOT NULL DEFAULT 0,
  engagement_score integer NOT NULL DEFAULT 0,
  churn_risk numeric(5,2) NOT NULL DEFAULT 0,
  signals jsonb DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.company_health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_health_scores" ON public.company_health_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "super_admin_manage_health_scores" ON public.company_health_scores
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- =============================================
-- 2. Support Canned Responses
-- =============================================
CREATE TABLE public.support_canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'general',
  shortcut text,
  sort_order integer DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_canned_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_canned" ON public.support_canned_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- =============================================
-- 3. SLA fields on subscription_plans
-- =============================================
ALTER TABLE public.subscription_plans 
  ADD COLUMN IF NOT EXISTS sla_response_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS sla_resolution_hours integer DEFAULT 72;

-- =============================================
-- 4. SLA tracking on support_conversations
-- =============================================
ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS sla_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_response_breached boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_resolution_breached boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);
