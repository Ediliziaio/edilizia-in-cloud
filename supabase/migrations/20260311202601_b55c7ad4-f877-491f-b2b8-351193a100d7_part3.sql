DROP POLICY IF EXISTS "multi_company_user_read_own" ON public.multi_company_access;
CREATE POLICY "multi_company_user_read_own" ON public.multi_company_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
