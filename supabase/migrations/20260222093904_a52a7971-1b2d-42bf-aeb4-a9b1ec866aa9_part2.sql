-- RLS policies
CREATE POLICY "Company admins can manage opportunity notes"
ON public.marketing_opportunity_notes FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
