DROP POLICY IF EXISTS "Staff can view calendar preferences if permitted" ON public.marketing_calendar_preferences;
CREATE POLICY "Staff can view calendar preferences if permitted"
  ON public.marketing_calendar_preferences FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
