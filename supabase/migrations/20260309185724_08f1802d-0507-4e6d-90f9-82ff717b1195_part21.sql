DROP POLICY IF EXISTS "prima_nota_tenant_select" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_tenant_select" ON public.prima_nota_entries
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));
