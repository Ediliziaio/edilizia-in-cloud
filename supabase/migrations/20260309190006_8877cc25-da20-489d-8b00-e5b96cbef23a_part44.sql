DROP POLICY IF EXISTS "prima_nota_tenant_insert" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_tenant_insert" ON public.prima_nota_entries
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
