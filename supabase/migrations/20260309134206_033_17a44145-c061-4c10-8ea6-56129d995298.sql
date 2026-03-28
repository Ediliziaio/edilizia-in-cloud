CREATE POLICY "Super admins manage all internal automation queue" ON public.internal_automation_queue FOR ALL USING (has_role(auth.uid(), 'super_admin'));
