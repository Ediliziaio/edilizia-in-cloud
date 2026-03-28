CREATE POLICY "co_credits_select" ON public.ai_credits
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
