CREATE POLICY "Staff can view appointments if permitted"
ON public.appointments
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_calendar'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);
