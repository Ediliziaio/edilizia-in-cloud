CREATE POLICY "super_admin_manage_completions" ON public.company_onboarding_completions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
