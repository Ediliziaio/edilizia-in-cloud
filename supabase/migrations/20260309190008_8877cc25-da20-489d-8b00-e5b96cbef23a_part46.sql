CREATE POLICY "prima_nota_tenant_delete" ON public.prima_nota_entries
  FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());
