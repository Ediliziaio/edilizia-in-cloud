-- ============================================================
-- REFERRAL TIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  min_active_companies INTEGER NOT NULL DEFAULT 0,
  commission_multiplier NUMERIC(4,2) DEFAULT 1.00,
  color TEXT DEFAULT '#CD7F32',
  icon TEXT DEFAULT '🥉',
  perks JSONB DEFAULT '[]',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
