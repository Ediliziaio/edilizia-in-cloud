CREATE POLICY "super_admin_manage_health_scores" ON public.company_health_scores
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
