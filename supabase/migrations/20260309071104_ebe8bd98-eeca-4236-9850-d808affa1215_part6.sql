DROP POLICY IF EXISTS "company_read_onboarding_steps" ON public.onboarding_steps;
CREATE POLICY "company_read_onboarding_steps" ON public.onboarding_steps
  FOR SELECT TO authenticated
  USING (true);
