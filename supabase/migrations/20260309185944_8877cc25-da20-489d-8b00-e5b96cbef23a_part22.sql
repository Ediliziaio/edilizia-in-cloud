DROP POLICY IF EXISTS "poi_tenant_delete" ON public.purchase_order_items;
CREATE POLICY "poi_tenant_delete" ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
