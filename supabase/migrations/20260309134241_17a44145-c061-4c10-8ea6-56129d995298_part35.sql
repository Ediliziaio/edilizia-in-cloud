DROP POLICY IF EXISTS "Super admins manage all internal automation execution log" ON public.internal_automation_execution_log;
CREATE POLICY "Super admins manage all internal automation execution log" ON public.internal_automation_execution_log FOR ALL USING (has_role(auth.uid(), 'super_admin'));
