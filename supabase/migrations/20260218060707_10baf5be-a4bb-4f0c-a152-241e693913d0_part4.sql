-- Super admins can manage all
DROP POLICY IF EXISTS "Super admins can manage all whatsapp config" ON public.messaging_whatsapp_config;
CREATE POLICY "Super admins can manage all whatsapp config"
ON public.messaging_whatsapp_config
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
