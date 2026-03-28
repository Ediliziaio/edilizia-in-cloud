-- RLS Policies (same pattern as orders, employees, etc.)
CREATE POLICY "Company admins can manage their marketing contacts"
ON public.marketing_contacts
FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
