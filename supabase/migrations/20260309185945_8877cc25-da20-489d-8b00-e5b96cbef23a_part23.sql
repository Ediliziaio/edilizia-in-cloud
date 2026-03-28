CREATE POLICY "poi_super_admin" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
