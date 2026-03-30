DROP POLICY IF EXISTS "Staff can manage orders if permitted" ON public.orders;
CREATE POLICY "Staff can manage orders if permitted"
ON public.orders
FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);
