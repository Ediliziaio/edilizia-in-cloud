DROP POLICY IF EXISTS "Company admins can manage their article templates" ON public.article_templates;
CREATE POLICY "Company admins can manage their article templates"
ON public.article_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
