CREATE POLICY "Staff can view automation nodes if permitted"
  ON public.automation_nodes FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));
