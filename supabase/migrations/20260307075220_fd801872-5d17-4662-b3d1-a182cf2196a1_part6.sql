CREATE POLICY "Users can update own company lists"
  ON public.marketing_opportunity_lists FOR UPDATE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
