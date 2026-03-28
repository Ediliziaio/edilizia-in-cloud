CREATE POLICY "Users can view own company phone numbers"
  ON public.ai_agent_phone_numbers FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
