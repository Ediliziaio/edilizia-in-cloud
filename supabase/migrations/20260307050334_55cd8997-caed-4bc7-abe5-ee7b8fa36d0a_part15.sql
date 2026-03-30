DROP POLICY IF EXISTS "co_topups_select" ON public.ai_credit_topups;
CREATE POLICY "co_topups_select" ON public.ai_credit_topups
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
