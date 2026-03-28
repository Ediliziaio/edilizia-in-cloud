CREATE POLICY "Users can manage own company insights cache"
  ON public.meta_insights_cache FOR ALL TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
