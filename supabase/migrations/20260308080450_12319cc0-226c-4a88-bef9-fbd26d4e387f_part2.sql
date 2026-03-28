-- RLS policies
CREATE POLICY "Users can view own company budgets" ON public.cost_budgets
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
