-- Company admins can manage their WhatsApp config
DROP POLICY IF EXISTS "Company admins can manage their whatsapp config" ON public.messaging_whatsapp_config;
CREATE POLICY "Company admins can manage their whatsapp config"
ON public.messaging_whatsapp_config
FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
