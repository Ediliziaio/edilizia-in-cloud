DROP POLICY IF EXISTS "Staff can view email logs if permitted" ON public.email_logs;
CREATE POLICY "Staff can view email logs if permitted" ON public.email_logs FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));
