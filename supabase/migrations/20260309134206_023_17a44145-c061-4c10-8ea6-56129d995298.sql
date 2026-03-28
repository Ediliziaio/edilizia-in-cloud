CREATE POLICY "Super admins manage all internal automation flows" ON public.internal_automation_flows FOR ALL USING (has_role(auth.uid(), 'super_admin'));
