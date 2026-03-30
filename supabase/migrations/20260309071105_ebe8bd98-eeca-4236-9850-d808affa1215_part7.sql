-- =============================================
-- 3. Company Onboarding Progress
-- =============================================
CREATE TABLE IF NOT EXISTS public.company_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  assigned_cs uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(company_id)
);
