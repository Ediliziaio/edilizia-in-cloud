-- Platform setting
INSERT INTO public.platform_settings (key, value)
VALUES ('whatsapp_price_per_msg_eur', '0.0006')
ON CONFLICT (key) DO NOTHING;
