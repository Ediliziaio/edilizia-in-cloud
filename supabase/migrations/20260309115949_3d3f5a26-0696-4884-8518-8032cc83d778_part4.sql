CREATE POLICY "company_members_read_templates"
ON public.quote_templates FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));
