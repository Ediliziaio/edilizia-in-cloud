DROP POLICY IF EXISTS "ai_kb_super_admin" ON public.ai_agent_knowledge_docs;
CREATE POLICY "ai_kb_super_admin" ON public.ai_agent_knowledge_docs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
