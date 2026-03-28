-- ============================================================
-- ADD COLUMNS TO referrers
-- ============================================================
ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES public.referral_tiers(id),
  ADD COLUMN IF NOT EXISTS tier_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partner_type TEXT DEFAULT 'referrer',
  ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS payout_details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_accepted_terms BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_conversions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(5,2) DEFAULT 0;
