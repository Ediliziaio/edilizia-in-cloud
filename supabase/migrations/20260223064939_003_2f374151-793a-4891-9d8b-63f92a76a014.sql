CREATE POLICY "Staff can view email templates if permitted" ON public.email_templates FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));
