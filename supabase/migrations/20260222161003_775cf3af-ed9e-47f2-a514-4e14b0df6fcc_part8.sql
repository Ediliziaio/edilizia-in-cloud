DROP POLICY IF EXISTS "Staff can view contact lists if permitted" ON public.marketing_contact_lists;
CREATE POLICY "Staff can view contact lists if permitted"
  ON public.marketing_contact_lists FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
