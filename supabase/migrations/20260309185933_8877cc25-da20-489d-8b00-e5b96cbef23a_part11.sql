DROP POLICY IF EXISTS "po_tenant_insert" ON public.purchase_orders;
CREATE POLICY "po_tenant_insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
