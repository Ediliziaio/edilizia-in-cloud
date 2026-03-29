-- 2. AI Credits (portafoglio per azienda)
CREATE TABLE IF NOT EXISTS public.ai_credits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID UNIQUE NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  balance_eur              DECIMAL(10,4) DEFAULT 0,
  total_recharged_eur      DECIMAL(10,4) DEFAULT 0,
  total_spent_eur          DECIMAL(10,4) DEFAULT 0,
  auto_recharge_enabled    BOOLEAN DEFAULT false,
  auto_recharge_threshold  DECIMAL(10,4) DEFAULT 5.00,
  auto_recharge_amount     DECIMAL(10,4) DEFAULT 20.00,
  auto_recharge_method     TEXT,
  auto_recharge_payment_ref TEXT,
  alert_threshold_eur      DECIMAL(10,4) DEFAULT 5.00,
  alert_email_sent_at      TIMESTAMPTZ,
  calls_blocked            BOOLEAN DEFAULT false,
  blocked_at               TIMESTAMPTZ,
  blocked_reason           TEXT,
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
