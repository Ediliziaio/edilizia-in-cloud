CREATE POLICY "prima_nota_tenant_update" ON public.prima_nota_entries
  FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
