DROP POLICY IF EXISTS "user_audit_log_insert" ON public.user_audit_log;
CREATE POLICY "user_audit_log_insert"
  ON public.user_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
