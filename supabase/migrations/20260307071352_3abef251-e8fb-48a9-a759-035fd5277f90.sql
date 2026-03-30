-- email_credits: wallet per azienda (come ai_credits)
CREATE TABLE IF NOT EXISTS public.email_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  balance_eur NUMERIC NOT NULL DEFAULT 0,
  total_spent_eur NUMERIC NOT NULL DEFAULT 0,
  total_recharged_eur NUMERIC NOT NULL DEFAULT 0,
  sends_blocked BOOLEAN NOT NULL DEFAULT false,
  auto_recharge_enabled BOOLEAN DEFAULT false,
  auto_recharge_threshold NUMERIC DEFAULT 1,
  auto_recharge_amount NUMERIC DEFAULT 10,
  alert_threshold_eur NUMERIC DEFAULT 2,
  alert_email_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);
