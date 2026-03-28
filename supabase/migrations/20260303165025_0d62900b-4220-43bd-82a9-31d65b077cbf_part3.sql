CREATE POLICY "Users can manage own company ad accounts"
  ON public.meta_ad_accounts FOR ALL TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
