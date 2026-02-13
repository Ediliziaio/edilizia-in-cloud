CREATE POLICY "Company admins can update their own company"
ON public.companies FOR UPDATE
USING (id = get_user_company_id(auth.uid()))
WITH CHECK (id = get_user_company_id(auth.uid()));