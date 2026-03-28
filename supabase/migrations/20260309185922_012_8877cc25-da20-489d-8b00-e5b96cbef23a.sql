CREATE POLICY "po_tenant_update" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
