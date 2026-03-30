DROP POLICY IF EXISTS "ai_kb_tenant_select" ON public.ai_agent_knowledge_docs;
CREATE POLICY "ai_kb_tenant_select" ON public.ai_agent_knowledge_docs
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
