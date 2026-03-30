DROP POLICY IF EXISTS "Company admins manage internal automation flows" ON public.internal_automation_flows;
CREATE POLICY "Company admins manage internal automation flows" ON public.internal_automation_flows FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
