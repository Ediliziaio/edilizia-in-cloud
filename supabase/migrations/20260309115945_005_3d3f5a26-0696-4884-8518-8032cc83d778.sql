CREATE POLICY "company_admin_manage_templates"
ON public.quote_templates FOR ALL TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
