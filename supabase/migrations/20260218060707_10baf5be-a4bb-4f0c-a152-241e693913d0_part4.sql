-- Super admins can manage all
CREATE POLICY "Super admins can manage all whatsapp config"
ON public.messaging_whatsapp_config
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
