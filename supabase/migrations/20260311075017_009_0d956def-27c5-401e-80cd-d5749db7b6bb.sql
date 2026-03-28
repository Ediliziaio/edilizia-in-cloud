CREATE POLICY "audits_tenant" ON public.inventory_audits FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
