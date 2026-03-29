CREATE POLICY "Users can view own company lists"
  ON public.marketing_opportunity_lists FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
