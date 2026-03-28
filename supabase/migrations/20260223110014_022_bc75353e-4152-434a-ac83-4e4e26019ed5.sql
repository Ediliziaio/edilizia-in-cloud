CREATE POLICY "Super admins can manage all automation enrollments"
  ON public.automation_enrollments FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
