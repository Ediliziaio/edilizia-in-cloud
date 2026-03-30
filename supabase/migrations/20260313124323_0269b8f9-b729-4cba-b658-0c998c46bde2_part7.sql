DROP POLICY IF EXISTS "task_automation_rules_select" ON public.task_automation_rules;
CREATE POLICY "task_automation_rules_select" ON public.task_automation_rules
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));
