DROP POLICY IF EXISTS "Staff can view custom fields if permitted" ON public.marketing_custom_fields;
CREATE POLICY "Staff can view custom fields if permitted"
  ON public.marketing_custom_fields FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
