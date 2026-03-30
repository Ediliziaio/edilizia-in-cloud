DROP POLICY IF EXISTS "super_admin_read_health_scores" ON public.company_health_scores;
CREATE POLICY "super_admin_read_health_scores" ON public.company_health_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
