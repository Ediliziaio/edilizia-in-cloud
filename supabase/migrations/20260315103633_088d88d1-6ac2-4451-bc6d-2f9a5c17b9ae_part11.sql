DROP POLICY IF EXISTS "ai_agents_v2_company_isolation" ON public.ai_agents_v2;
CREATE POLICY "ai_agents_v2_company_isolation" ON ai_agents_v2
  FOR ALL USING (company_id = public.get_my_company_id());
