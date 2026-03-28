CREATE POLICY "task_automation_rules_delete" ON public.task_automation_rules
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));
