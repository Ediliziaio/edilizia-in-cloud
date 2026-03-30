DROP POLICY IF EXISTS "int_calls_tenant_select" ON public.internal_call_logs;
CREATE POLICY "int_calls_tenant_select" ON public.internal_call_logs
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
