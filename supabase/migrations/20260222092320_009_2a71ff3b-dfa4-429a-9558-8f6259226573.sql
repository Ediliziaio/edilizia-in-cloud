CREATE POLICY "Staff can view pipeline stages if permitted"
  ON public.marketing_pipeline_stages FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
