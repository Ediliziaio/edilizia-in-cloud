-- 3. whatsapp_credits
CREATE TABLE public.whatsapp_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  balance_eur numeric(12,4) NOT NULL DEFAULT 0,
  total_spent_eur numeric(12,4) NOT NULL DEFAULT 0,
  total_recharged_eur numeric(12,4) NOT NULL DEFAULT 0,
  sends_blocked boolean NOT NULL DEFAULT false,
  auto_recharge_enabled boolean NOT NULL DEFAULT false,
  auto_recharge_threshold numeric(10,2) DEFAULT 5,
  auto_recharge_amount numeric(10,2) DEFAULT 20,
  alert_threshold_eur numeric(10,2),
  alert_email_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
