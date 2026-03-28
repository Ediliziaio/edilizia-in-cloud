CREATE POLICY "Company users view internal automation enrollments" ON public.internal_automation_enrollments FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
