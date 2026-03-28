CREATE POLICY "Staff can view automation enrollments if permitted"
  ON public.automation_enrollments FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));
