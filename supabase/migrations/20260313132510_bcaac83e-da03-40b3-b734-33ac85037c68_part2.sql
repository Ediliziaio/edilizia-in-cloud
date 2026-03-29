CREATE POLICY "Templates are readable by authenticated users"
  ON public.ai_agent_templates FOR SELECT TO authenticated
  USING (is_active = true);
