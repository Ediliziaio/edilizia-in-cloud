DROP POLICY IF EXISTS "Super admins can manage all automation connections" ON public.automation_connections;
CREATE POLICY "Super admins can manage all automation connections"
  ON public.automation_connections FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
