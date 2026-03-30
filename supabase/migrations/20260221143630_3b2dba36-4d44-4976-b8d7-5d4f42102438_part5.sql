DROP POLICY IF EXISTS "Staff can view marketing contacts if permitted" ON public.marketing_contacts;
CREATE POLICY "Staff can view marketing contacts if permitted"
ON public.marketing_contacts
FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
