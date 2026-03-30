DROP POLICY IF EXISTS "form_views_tenant_select" ON public.form_views;
CREATE POLICY "form_views_tenant_select" ON public.form_views
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
