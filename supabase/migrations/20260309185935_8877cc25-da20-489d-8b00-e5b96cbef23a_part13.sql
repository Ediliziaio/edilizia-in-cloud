CREATE POLICY "po_tenant_delete" ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
