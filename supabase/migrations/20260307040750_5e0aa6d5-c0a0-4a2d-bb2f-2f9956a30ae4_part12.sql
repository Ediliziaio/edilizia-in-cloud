DROP POLICY IF EXISTS "ai_kb_tenant_insert" ON public.ai_agent_knowledge_docs;
CREATE POLICY "ai_kb_tenant_insert" ON public.ai_agent_knowledge_docs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
