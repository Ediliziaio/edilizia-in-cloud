CREATE POLICY "co_usage_select" ON public.ai_credit_usage
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
