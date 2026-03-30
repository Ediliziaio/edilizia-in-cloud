-- WhatsApp Business configuration per company
CREATE TABLE IF NOT EXISTS public.messaging_whatsapp_config (
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
