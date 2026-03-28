CREATE POLICY "lot_batches_tenant" ON public.warehouse_lot_batches FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
