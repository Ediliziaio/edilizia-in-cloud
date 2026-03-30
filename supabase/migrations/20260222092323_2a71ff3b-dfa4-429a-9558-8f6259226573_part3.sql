DROP POLICY IF EXISTS "Staff can view pipelines if permitted" ON public.marketing_pipelines;
CREATE POLICY "Staff can view pipelines if permitted"
  ON public.marketing_pipelines FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
