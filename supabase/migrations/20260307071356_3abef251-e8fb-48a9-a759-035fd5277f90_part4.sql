-- email_pricing: configurazione super admin
CREATE TABLE IF NOT EXISTS public.email_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'sendgrid',
  label TEXT,
  cost_real_per_email NUMERIC NOT NULL DEFAULT 0.0001,
  cost_billed_per_email NUMERIC NOT NULL DEFAULT 0.0003,
  markup_multiplier NUMERIC NOT NULL DEFAULT 3.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
