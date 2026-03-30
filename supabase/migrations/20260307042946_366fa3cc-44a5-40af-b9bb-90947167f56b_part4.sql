DROP POLICY IF EXISTS "Users can update own company phone numbers" ON public.ai_agent_phone_numbers;
CREATE POLICY "Users can update own company phone numbers"
  ON public.ai_agent_phone_numbers FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
