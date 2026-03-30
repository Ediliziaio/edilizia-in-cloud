DROP POLICY IF EXISTS "super_admin_manage_onboarding_templates" ON public.onboarding_templates;
CREATE POLICY "super_admin_manage_onboarding_templates" ON public.onboarding_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
