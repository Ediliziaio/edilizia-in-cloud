CREATE POLICY "Super admins manage all internal automation connections" ON public.internal_automation_connections FOR ALL USING (has_role(auth.uid(), 'super_admin'));
