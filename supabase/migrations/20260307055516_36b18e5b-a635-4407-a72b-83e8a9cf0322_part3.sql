DROP POLICY IF EXISTS "Users can manage their company tests" ON public.ai_agent_tests;
CREATE POLICY "Users can manage their company tests"
  ON public.ai_agent_tests
  FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
