CREATE POLICY "Super admins can manage all automation flows"
  ON public.automation_flows FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
