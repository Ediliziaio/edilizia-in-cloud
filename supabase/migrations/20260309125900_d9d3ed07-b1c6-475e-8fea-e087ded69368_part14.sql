-- ============================================================
-- ADD COLUMNS TO referral_payouts (workflow)
-- ============================================================
ALTER TABLE public.referral_payouts
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requested_by_referrer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT;
