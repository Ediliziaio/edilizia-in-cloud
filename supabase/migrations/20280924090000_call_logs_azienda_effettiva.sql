-- Azienda effettiva (vista cliente, multi-azienda) invece del profilo, che per il super admin è NULL.

DROP POLICY IF EXISTS call_logs_insert ON public.call_logs;
CREATE POLICY call_logs_insert ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS call_logs_select ON public.call_logs;
CREATE POLICY call_logs_select ON public.call_logs
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND public.check_staff_visibility((SELECT auth.uid()), user_id)
  );

DROP POLICY IF EXISTS call_logs_update ON public.call_logs;
CREATE POLICY call_logs_update ON public.call_logs
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND public.check_staff_visibility((SELECT auth.uid()), user_id)
  );

DROP POLICY IF EXISTS call_logs_delete ON public.call_logs;
CREATE POLICY call_logs_delete ON public.call_logs
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role)
  );
