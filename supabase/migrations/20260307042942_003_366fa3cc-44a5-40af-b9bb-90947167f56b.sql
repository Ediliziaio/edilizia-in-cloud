CREATE POLICY "Users can insert own company phone numbers"
  ON public.ai_agent_phone_numbers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
