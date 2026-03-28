-- 1. company_billing_overrides
CREATE TABLE public.company_billing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('email', 'ai_agents', 'whatsapp', 'sms', 'phone_numbers')),
  is_enabled boolean NOT NULL DEFAULT true,
  is_free boolean NOT NULL DEFAULT false,
  price_per_unit_eur numeric(10,4),
  markup_multiplier numeric(6,2),
  monthly_fee_eur numeric(10,2),
  custom_notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, service)
);
