CREATE POLICY "Staff can view order salespeople if permitted"
ON public.order_salespeople FOR SELECT TO authenticated
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_salespeople.order_id AND o.company_id = get_user_company_id(auth.uid())
));
