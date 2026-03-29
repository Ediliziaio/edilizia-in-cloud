CREATE POLICY "company_read_own_onboarding" ON public.company_onboarding
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
