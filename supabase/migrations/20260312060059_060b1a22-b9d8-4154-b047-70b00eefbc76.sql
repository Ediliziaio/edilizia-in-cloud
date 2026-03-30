-- Table: virtual_phone_numbers
CREATE TABLE IF NOT EXISTS public.virtual_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  telnyx_phone_id TEXT,
  country_code TEXT DEFAULT 'IT',
  number_type TEXT DEFAULT 'local',
  capabilities JSONB DEFAULT '{"sms": true, "voice": false}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  monthly_cost_eur NUMERIC(10,4) DEFAULT 0,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
