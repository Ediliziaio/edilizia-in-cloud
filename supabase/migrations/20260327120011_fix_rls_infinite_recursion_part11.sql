-- Staff: use SECURITY DEFINER function
CREATE POLICY "Staff can view order salespeople if permitted"
ON public.order_salespeople FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_salespeople.order_id) = public.get_user_company_id(auth.uid())
);
