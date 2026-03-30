DROP POLICY IF EXISTS "scadenze_tenant_delete" ON public.scadenze;
CREATE POLICY "scadenze_tenant_delete" ON public.scadenze
  FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());
