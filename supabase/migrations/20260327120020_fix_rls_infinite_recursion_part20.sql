-- Staff with permission
CREATE POLICY "Staff can view order items if permitted"
ON public.order_items FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_items.order_id) = public.get_user_company_id(auth.uid())
);
