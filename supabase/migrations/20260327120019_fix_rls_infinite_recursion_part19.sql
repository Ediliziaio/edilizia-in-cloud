DROP POLICY IF EXISTS "Customers can view their order items" ON public.order_items;
CREATE POLICY "Customers can view their order items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  public.get_order_customer_id(order_items.order_id) = auth.uid()
);
