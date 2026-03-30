-- =============================================
-- 4. Company Onboarding Step Completions
-- =============================================
CREATE TABLE IF NOT EXISTS public.company_onboarding_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.onboarding_steps(id) ON DELETE CASCADE,
  completed_by uuid,
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE(company_id, step_id)
);
