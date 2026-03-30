-- Table: phone_number_sms_usage
CREATE TABLE IF NOT EXISTS public.phone_number_sms_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id UUID NOT NULL REFERENCES public.virtual_phone_numbers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  sms_sent INTEGER DEFAULT 0,
  sms_received INTEGER DEFAULT 0,
  cost_eur NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
