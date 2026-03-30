DROP POLICY IF EXISTS "ai_convos_super_admin" ON public.ai_agent_conversations;
CREATE POLICY "ai_convos_super_admin" ON public.ai_agent_conversations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
