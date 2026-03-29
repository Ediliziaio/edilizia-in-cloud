CREATE POLICY "Users can insert own company budgets" ON public.cost_budgets
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
