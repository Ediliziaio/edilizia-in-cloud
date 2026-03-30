DROP POLICY IF EXISTS "playbook_completions_company_isolation" ON public.sales_playbook_completions;
CREATE POLICY "playbook_completions_company_isolation"
  ON sales_playbook_completions FOR ALL
  USING (company_id = public.get_my_company_id());
