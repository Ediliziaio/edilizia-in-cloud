DROP POLICY IF EXISTS "Users can insert own company lists" ON public.marketing_opportunity_lists;
CREATE POLICY "Users can insert own company lists"
  ON public.marketing_opportunity_lists FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
