CREATE POLICY "scadenze_tenant_update" ON public.scadenze
  FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
