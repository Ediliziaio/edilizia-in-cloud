DROP POLICY IF EXISTS "Users can view own company meta assets" ON public.meta_assets;
CREATE POLICY "Users can view own company meta assets"
  ON public.meta_assets FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
