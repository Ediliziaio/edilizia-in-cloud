
-- WhatsApp Business configuration per company
CREATE TABLE public.messaging_whatsapp_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number text,
  phone_number_id text,
  waba_id text,
  business_name text,
  account_status text NOT NULL DEFAULT 'not_verified',
  quality_rating text NOT NULL DEFAULT 'none',
  is_connected boolean NOT NULL DEFAULT false,
  access_token_encrypted text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messaging_whatsapp_config_company_id_key UNIQUE (company_id)
);

ALTER TABLE public.messaging_whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Company admins can manage their WhatsApp config
CREATE POLICY "Company admins can manage their whatsapp config"
ON public.messaging_whatsapp_config
FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

-- Staff can view if permitted
CREATE POLICY "Staff can view whatsapp config if permitted"
ON public.messaging_whatsapp_config
FOR SELECT
USING (has_permission(auth.uid(), 'can_view_settings'::text) AND company_id = get_user_company_id(auth.uid()));

-- Super admins can manage all
CREATE POLICY "Super admins can manage all whatsapp config"
ON public.messaging_whatsapp_config
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_messaging_whatsapp_config_updated_at
BEFORE UPDATE ON public.messaging_whatsapp_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
