DROP POLICY IF EXISTS "Templates are readable by authenticated users" ON public.ai_agent_templates;
CREATE POLICY "Templates are readable by authenticated users"
  ON public.ai_agent_templates FOR SELECT TO authenticated
  USING (is_active = true);
