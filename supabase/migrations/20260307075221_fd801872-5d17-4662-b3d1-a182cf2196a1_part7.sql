DROP POLICY IF EXISTS "Users can delete own company lists" ON public.marketing_opportunity_lists;
CREATE POLICY "Users can delete own company lists"
  ON public.marketing_opportunity_lists FOR DELETE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
