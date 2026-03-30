DROP POLICY IF EXISTS "Company admins can view their email billing" ON public.email_billing;
CREATE POLICY "Company admins can view their email billing" ON public.email_billing FOR SELECT
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
