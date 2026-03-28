CREATE POLICY "Super admins can manage all automation execution logs"
  ON public.automation_execution_log FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
