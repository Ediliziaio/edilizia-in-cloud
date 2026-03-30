DROP POLICY IF EXISTS "phone_v2_company_isolation" ON public.ai_phone_numbers_v2;
CREATE POLICY "phone_v2_company_isolation" ON ai_phone_numbers_v2
  FOR ALL USING (company_id = public.get_my_company_id());
