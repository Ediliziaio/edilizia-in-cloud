CREATE POLICY "automation_rules_update" ON public.automation_rules FOR UPDATE
USING (
  company_id = public.get_my_company_id()
  AND is_template = false
);
