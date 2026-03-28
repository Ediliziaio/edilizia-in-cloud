CREATE POLICY "kb_v2_company_isolation" ON ai_knowledge_base_v2
  FOR ALL USING (company_id = public.get_my_company_id());
