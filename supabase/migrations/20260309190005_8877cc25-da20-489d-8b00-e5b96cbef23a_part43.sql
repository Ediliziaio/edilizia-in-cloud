CREATE POLICY "prima_nota_tenant_select" ON public.prima_nota_entries
  FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
