DROP POLICY IF EXISTS "Staff can view tasks if permitted" ON public.tasks;
CREATE POLICY "Staff can view tasks if permitted"
ON public.tasks
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);
