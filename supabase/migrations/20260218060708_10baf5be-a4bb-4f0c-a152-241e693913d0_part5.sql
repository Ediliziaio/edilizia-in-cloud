-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_messaging_whatsapp_config_updated_at ON public.messaging_whatsapp_config;
CREATE TRIGGER update_messaging_whatsapp_config_updated_at
BEFORE UPDATE ON public.messaging_whatsapp_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
