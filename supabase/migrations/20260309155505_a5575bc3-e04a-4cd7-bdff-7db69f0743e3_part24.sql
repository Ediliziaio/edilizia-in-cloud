DROP POLICY IF EXISTS "company_billing_sync_log" ON public.billing_sync_log;
CREATE POLICY "company_billing_sync_log" ON billing_sync_log
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
