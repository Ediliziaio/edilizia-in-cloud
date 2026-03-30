DROP POLICY IF EXISTS "company_manage_own_completions" ON public.company_onboarding_completions;
CREATE POLICY "company_manage_own_completions" ON public.company_onboarding_completions
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
