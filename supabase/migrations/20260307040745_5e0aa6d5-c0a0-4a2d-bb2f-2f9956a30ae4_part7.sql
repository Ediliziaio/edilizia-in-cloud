DROP POLICY IF EXISTS "ai_agents_super_admin" ON public.ai_agents;
CREATE POLICY "ai_agents_super_admin" ON public.ai_agents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
