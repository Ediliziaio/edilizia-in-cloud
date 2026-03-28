-- ============================================================
-- COMMISSION LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  subscription_plan_name TEXT,
  plan_mrr NUMERIC(10,2) DEFAULT 0,
  commission_type TEXT,
  commission_rate NUMERIC(5,2),
  tier_multiplier NUMERIC(4,2) DEFAULT 1.00,
  commission_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payout_id UUID REFERENCES public.referral_payouts(id),
  notes TEXT,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, company_id, period_month, period_year)
);
