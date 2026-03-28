CREATE POLICY "Staff can view marketing tags if permitted"
ON public.marketing_tags FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
