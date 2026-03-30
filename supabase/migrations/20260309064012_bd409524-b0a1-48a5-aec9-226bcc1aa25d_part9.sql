DROP POLICY IF EXISTS "Company users read own overrides" ON public.company_feature_overrides;
CREATE POLICY "Company users read own overrides"
  ON public.company_feature_overrides FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
