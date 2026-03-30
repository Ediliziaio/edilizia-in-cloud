DROP POLICY IF EXISTS "Company users view internal automation queue" ON public.internal_automation_queue;
CREATE POLICY "Company users view internal automation queue" ON public.internal_automation_queue FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
