-- RLS for marketing_contact_lists
CREATE POLICY "Company admins can manage their contact lists"
  ON public.marketing_contact_lists FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
