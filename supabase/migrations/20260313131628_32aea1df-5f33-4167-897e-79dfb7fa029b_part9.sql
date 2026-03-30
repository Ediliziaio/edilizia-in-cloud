DROP POLICY IF EXISTS "automation_rules_select" ON public.automation_rules;
CREATE POLICY "automation_rules_select" ON public.automation_rules FOR SELECT
USING (
  is_template = true
  OR company_id = public.get_my_company_id()
);
