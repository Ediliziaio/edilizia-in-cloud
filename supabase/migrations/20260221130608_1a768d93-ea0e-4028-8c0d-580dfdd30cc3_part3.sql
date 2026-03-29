-- Orders: staff RLS policies
CREATE POLICY "Staff can view orders if permitted"
ON public.orders
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);
