CREATE POLICY "Users can view own company ad accounts"
  ON public.meta_ad_accounts FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
