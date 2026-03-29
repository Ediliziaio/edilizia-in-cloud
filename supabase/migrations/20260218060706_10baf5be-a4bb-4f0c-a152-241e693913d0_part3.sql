-- Staff can view if permitted
CREATE POLICY "Staff can view whatsapp config if permitted"
ON public.messaging_whatsapp_config
FOR SELECT
USING (has_permission(auth.uid(), 'can_view_settings'::text) AND company_id = get_user_company_id(auth.uid()));
