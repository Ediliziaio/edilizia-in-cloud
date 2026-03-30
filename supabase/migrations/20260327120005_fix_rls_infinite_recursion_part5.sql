-- Staff: use SECURITY DEFINER function
DROP POLICY IF EXISTS "Staff can view order employees if permitted" ON public.order_employees;
CREATE POLICY "Staff can view order employees if permitted"
ON public.order_employees FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_employees.order_id) = public.get_user_company_id(auth.uid())
);
