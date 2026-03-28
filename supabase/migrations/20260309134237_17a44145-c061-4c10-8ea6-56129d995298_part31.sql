CREATE POLICY "Super admins manage all internal automation enrollments" ON public.internal_automation_enrollments FOR ALL USING (has_role(auth.uid(), 'super_admin'));
