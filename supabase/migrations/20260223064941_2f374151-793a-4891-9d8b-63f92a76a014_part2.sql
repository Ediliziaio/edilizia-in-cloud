DROP POLICY IF EXISTS "Company admins can manage their email templates" ON public.email_templates;
CREATE POLICY "Company admins can manage their email templates" ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
