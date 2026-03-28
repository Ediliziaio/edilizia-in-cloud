CREATE POLICY "task_automation_rules_insert" ON public.task_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));
