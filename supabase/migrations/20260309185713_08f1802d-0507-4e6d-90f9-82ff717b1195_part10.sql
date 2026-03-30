DROP POLICY IF EXISTS "scadenze_tenant_insert" ON public.scadenze;
CREATE POLICY "scadenze_tenant_insert" ON public.scadenze
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));
