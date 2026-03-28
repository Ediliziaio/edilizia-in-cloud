CREATE POLICY "po_super_admin" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
