CREATE POLICY "Staff can manage article templates if permitted"
ON public.article_templates FOR ALL TO authenticated
USING (has_permission(auth.uid(), 'can_edit_orders'::text) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_permission(auth.uid(), 'can_edit_orders'::text) AND company_id = get_user_company_id(auth.uid()));
