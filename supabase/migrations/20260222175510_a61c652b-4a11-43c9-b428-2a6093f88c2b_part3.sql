CREATE POLICY "Staff can view marketing documents if permitted"
  ON public.marketing_documents FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders') AND company_id = get_user_company_id(auth.uid()));
