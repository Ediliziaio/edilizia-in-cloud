CREATE POLICY "Users can delete own company budgets" ON public.cost_budgets
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
