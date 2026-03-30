DROP POLICY IF EXISTS "Staff can view email campaigns if permitted" ON public.email_campaigns;
CREATE POLICY "Staff can view email campaigns if permitted" ON public.email_campaigns FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));
