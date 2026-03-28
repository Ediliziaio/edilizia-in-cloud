CREATE POLICY "Users can view own company insights cache"
  ON public.meta_insights_cache FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
