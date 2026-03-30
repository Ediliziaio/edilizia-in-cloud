DROP POLICY IF EXISTS "scadenze_tenant_update" ON public.scadenze;
CREATE POLICY "scadenze_tenant_update" ON public.scadenze
  FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));
