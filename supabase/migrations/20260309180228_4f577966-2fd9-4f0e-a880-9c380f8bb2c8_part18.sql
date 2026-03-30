DROP POLICY IF EXISTS "form_submissions_tenant_select" ON public.form_submissions;
CREATE POLICY "form_submissions_tenant_select" ON public.form_submissions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
