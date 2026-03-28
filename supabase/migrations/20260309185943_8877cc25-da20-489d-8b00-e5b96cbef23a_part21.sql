CREATE POLICY "poi_tenant_update" ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
