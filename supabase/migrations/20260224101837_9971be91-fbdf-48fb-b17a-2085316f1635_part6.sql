DROP POLICY IF EXISTS "Staff can view article templates if permitted" ON public.article_templates;
CREATE POLICY "Staff can view article templates if permitted"
ON public.article_templates FOR SELECT TO authenticated
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));
