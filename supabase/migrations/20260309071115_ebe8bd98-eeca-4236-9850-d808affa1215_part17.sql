CREATE POLICY "super_admin_manage_cs_tasks" ON public.cs_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
