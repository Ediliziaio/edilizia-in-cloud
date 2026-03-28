CREATE POLICY "scadenze_tenant_select" ON public.scadenze
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));
