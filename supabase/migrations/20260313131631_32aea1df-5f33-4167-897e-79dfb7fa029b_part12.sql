DROP POLICY IF EXISTS "automation_rules_delete" ON public.automation_rules;
CREATE POLICY "automation_rules_delete" ON public.automation_rules FOR DELETE
USING (
  company_id = public.get_my_company_id()
  AND is_template = false
);
