CREATE POLICY "int_calls_tenant_insert" ON public.internal_call_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
