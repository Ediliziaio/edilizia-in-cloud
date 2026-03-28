CREATE POLICY "scadenze_tenant_select" ON public.scadenze
  FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
