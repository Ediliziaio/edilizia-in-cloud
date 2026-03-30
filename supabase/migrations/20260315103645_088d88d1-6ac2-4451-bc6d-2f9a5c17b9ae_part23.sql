DROP POLICY IF EXISTS "conv_v2_company_isolation" ON public.ai_conversations_v2;
CREATE POLICY "conv_v2_company_isolation" ON ai_conversations_v2
  FOR ALL USING (company_id = public.get_my_company_id());
