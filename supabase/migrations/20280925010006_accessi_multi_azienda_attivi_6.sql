-- Accessi multi-azienda: contano solo se attivi e non scaduti — lotto 6 di 6,
-- companies (25/09/2026). Il perché e il metodo sono in 20280925010001.
--
-- companies da sola, per ultima: la leggono il login e il selettore azienda.
-- Con un accesso sospeso, invitato o scaduto l'azienda non si legge più; il
-- selettore (AuthContext) ora scarta quegli accessi, altrimenti comparirebbero
-- come voci senza nome. La scelta vera dell'azienda passa già da
-- set_active_company, che controlla con user_can_access_company.

SET LOCAL lock_timeout = '3s';

-- companies
DROP POLICY IF EXISTS "Company admins can update multi-company companies" ON public.companies;
CREATE POLICY "Company admins can update multi-company companies" ON public.companies
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = companies.id) AND (mca.access_role = 'company_admin'::text) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now())))))
  )
  WITH CHECK (
    (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = companies.id) AND (mca.access_role = 'company_admin'::text) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now())))))
  );
DROP POLICY IF EXISTS companies_lettura_authenticated ON public.companies;
CREATE POLICY companies_lettura_authenticated ON public.companies
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((id = public.get_user_company_id(( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = companies.id) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now()))))) OR (id = public.get_user_company_id(( SELECT auth.uid() AS uid))) OR public.user_can_read_accountant_company(id) OR ((parent_company_id IS NOT NULL) AND (parent_company_id = public.get_user_company_id(( SELECT auth.uid() AS uid))) AND (public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'produttore_admin'::public.app_role))))
  );
