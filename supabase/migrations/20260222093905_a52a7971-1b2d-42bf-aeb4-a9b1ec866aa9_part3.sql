CREATE POLICY "Staff can view opportunity notes if permitted"
ON public.marketing_opportunity_notes FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
