DROP POLICY IF EXISTS "ai_credits_super_admin" ON public.ai_agent_credits;
CREATE POLICY "ai_credits_super_admin" ON public.ai_agent_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
