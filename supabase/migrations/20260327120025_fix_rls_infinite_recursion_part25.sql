CREATE POLICY "Staff can view order status history if permitted"
ON public.order_status_history FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_status_history.order_id) = public.get_user_company_id(auth.uid())
);
