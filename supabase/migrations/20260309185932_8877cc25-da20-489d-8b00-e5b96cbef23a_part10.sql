CREATE POLICY "po_tenant_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
