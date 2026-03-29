CREATE POLICY "Users can view own company audit log"
  ON public.integration_audit_log FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
