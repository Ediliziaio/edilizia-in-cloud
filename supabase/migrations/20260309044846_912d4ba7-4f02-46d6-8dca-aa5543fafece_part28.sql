DROP POLICY IF EXISTS "user_audit_log_select_admin" ON public.user_audit_log;
CREATE POLICY "user_audit_log_select_admin"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );
