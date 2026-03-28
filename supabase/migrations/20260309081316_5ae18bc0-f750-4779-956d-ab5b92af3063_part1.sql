-- 1. bank_provider_configs
CREATE TABLE IF NOT EXISTS public.bank_provider_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug   text UNIQUE NOT NULL,
  provider_name   text NOT NULL,
  logo_url        text,
  description     text,
  is_enabled      boolean NOT NULL DEFAULT false,
  supported_countries text[] DEFAULT ARRAY['IT','FR','DE','ES','NL','BE','AT','PT'],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
