CREATE POLICY "Users can update own company budgets" ON public.cost_budgets
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
