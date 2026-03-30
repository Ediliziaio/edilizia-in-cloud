DROP POLICY IF EXISTS "Staff can manage appointments if permitted" ON public.appointments;
CREATE POLICY "Staff can manage appointments if permitted"
ON public.appointments
FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);
