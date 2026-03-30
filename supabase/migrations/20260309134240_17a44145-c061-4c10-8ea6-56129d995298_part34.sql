DROP POLICY IF EXISTS "Company users view internal automation execution log" ON public.internal_automation_execution_log;
CREATE POLICY "Company users view internal automation execution log" ON public.internal_automation_execution_log FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
