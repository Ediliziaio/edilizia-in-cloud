DROP POLICY IF EXISTS "ak_v2_isolation" ON public.ai_agent_knowledge_v2;
CREATE POLICY "ak_v2_isolation" ON ai_agent_knowledge_v2
  FOR ALL USING (EXISTS (
    SELECT 1 FROM ai_agents_v2 WHERE id = agent_id AND company_id = public.get_my_company_id()
  ));
