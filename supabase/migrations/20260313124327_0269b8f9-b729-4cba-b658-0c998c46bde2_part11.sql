DROP POLICY IF EXISTS "task_automation_log_select" ON public.task_automation_log;
CREATE POLICY "task_automation_log_select" ON public.task_automation_log
  FOR SELECT TO authenticated
  USING (
    rule_id IN (
      SELECT id FROM public.task_automation_rules
      WHERE company_id = public.get_my_company_id()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
