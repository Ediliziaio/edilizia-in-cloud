-- RLS Policies
CREATE POLICY "Company admins can manage their marketing tags"
ON public.marketing_tags FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
