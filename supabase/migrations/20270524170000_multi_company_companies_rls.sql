-- Multi-company tenant switcher: users must be able to resolve company metadata
-- for every company explicitly granted in multi_company_access.
DROP POLICY IF EXISTS "Members can view multi-company companies" ON public.companies;
CREATE POLICY "Members can view multi-company companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = companies.id
    )
  );

DROP POLICY IF EXISTS "Company admins can update multi-company companies" ON public.companies;
CREATE POLICY "Company admins can update multi-company companies"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = companies.id
        AND mca.access_role = 'company_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = companies.id
        AND mca.access_role = 'company_admin'
    )
  );
