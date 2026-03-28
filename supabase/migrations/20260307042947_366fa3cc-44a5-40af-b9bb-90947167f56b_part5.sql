CREATE POLICY "Users can delete own company phone numbers"
  ON public.ai_agent_phone_numbers FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
