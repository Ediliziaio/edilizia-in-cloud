CREATE POLICY "automation_rules_insert" ON public.automation_rules FOR INSERT
WITH CHECK (
  company_id = public.get_my_company_id()
  AND is_template = false
);
