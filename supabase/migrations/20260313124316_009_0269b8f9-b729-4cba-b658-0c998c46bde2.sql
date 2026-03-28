CREATE POLICY "task_automation_rules_update" ON public.task_automation_rules
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));
