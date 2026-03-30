DROP POLICY IF EXISTS "lot_batches_admin" ON public.warehouse_lot_batches;
CREATE POLICY "lot_batches_admin" ON public.warehouse_lot_batches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
