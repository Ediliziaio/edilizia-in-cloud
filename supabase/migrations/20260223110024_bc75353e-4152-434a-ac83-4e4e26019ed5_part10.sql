CREATE POLICY "Super admins can manage all automation nodes"
  ON public.automation_nodes FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
