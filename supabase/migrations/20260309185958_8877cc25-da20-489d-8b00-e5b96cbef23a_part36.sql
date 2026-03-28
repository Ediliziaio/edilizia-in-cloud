CREATE POLICY "scadenze_tenant_insert" ON public.scadenze
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
