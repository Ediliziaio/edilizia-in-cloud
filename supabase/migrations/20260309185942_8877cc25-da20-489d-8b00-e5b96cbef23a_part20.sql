DROP POLICY IF EXISTS "poi_tenant_insert" ON public.purchase_order_items;
CREATE POLICY "poi_tenant_insert" ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
