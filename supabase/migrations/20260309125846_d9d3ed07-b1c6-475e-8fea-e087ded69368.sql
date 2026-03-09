
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

ALTER TABLE public.referral_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_tiers" ON public.referral_tiers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "authenticated_read_tiers" ON public.referral_tiers FOR SELECT TO authenticated
USING (true);

-- Insert default tiers
INSERT INTO public.referral_tiers (name, slug, min_active_companies, commission_multiplier, color, icon, perks, position) VALUES
  ('Bronze',   'bronze',   0,  1.00, '#CD7F32', '🥉', '["Link referral personale", "Dashboard base"]', 1),
  ('Silver',   'silver',   3,  1.15, '#C0C0C0', '🥈', '["Commission +15%", "Report mensile", "Supporto prioritario"]', 2),
  ('Gold',     'gold',     10, 1.25, '#FFD700', '🥇', '["Commission +25%", "Materiali marketing", "Account manager dedicato"]', 3),
  ('Platinum', 'platinum', 25, 1.40, '#E5E4E2', '💎', '["Commission +40%", "White-label co-brand", "Revenue share sugli upgrade"]', 4)
ON CONFLICT (slug) DO NOTHING;

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

-- ============================================================
-- REFERRAL CLICKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_page TEXT,
  converted BOOLEAN DEFAULT false,
  converted_company_id UUID REFERENCES public.companies(id),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_clicks" ON public.referral_clicks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "referrer_self_clicks" ON public.referral_clicks FOR SELECT TO authenticated
USING (referrer_id IN (SELECT id FROM referrers WHERE user_id = auth.uid()));

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

ALTER TABLE public.referral_commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_ledger" ON public.referral_commission_ledger FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "referrer_self_ledger" ON public.referral_commission_ledger FOR SELECT TO authenticated
USING (referrer_id IN (SELECT id FROM referrers WHERE user_id = auth.uid()));

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

-- Add INSERT policy for referrers on referral_payouts (self-request)
CREATE POLICY "referrer_self_insert_payout" ON public.referral_payouts FOR INSERT TO authenticated
WITH CHECK (referrer_id IN (SELECT id FROM referrers WHERE user_id = auth.uid()));

-- ============================================================
-- PARTNER MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.partner_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  min_tier TEXT DEFAULT 'bronze',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.partner_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_materials" ON public.partner_materials FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "partners_view_materials" ON public.partner_materials FOR SELECT TO authenticated
USING (
  is_active = true AND
  EXISTS (
    SELECT 1 FROM referrers r
    JOIN referral_tiers t ON r.tier_id = t.id
    JOIN referral_tiers mt ON public.partner_materials.min_tier = mt.slug
    WHERE r.user_id = auth.uid()
    AND t.position >= mt.position
  )
);

-- ============================================================
-- SQL FUNCTIONS
-- ============================================================

-- Increment clicks
CREATE OR REPLACE FUNCTION public.increment_referrer_clicks(p_referrer_id UUID)
RETURNS VOID AS $$
  UPDATE public.referrers SET total_clicks = COALESCE(total_clicks, 0) + 1 WHERE id = p_referrer_id;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Update referrer tier
CREATE OR REPLACE FUNCTION public.update_referrer_tier(p_referrer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_active_count INTEGER;
  v_tier_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_active_count
  FROM referral_companies rc
  JOIN companies c ON rc.company_id = c.id
  WHERE rc.referrer_id = p_referrer_id
    AND rc.is_active = true
    AND c.status = 'active';

  SELECT id INTO v_tier_id
  FROM referral_tiers
  WHERE min_active_companies <= v_active_count
  ORDER BY min_active_companies DESC
  LIMIT 1;

  UPDATE referrers SET
    tier_id = v_tier_id,
    tier_updated_at = now(),
    total_conversions = v_active_count,
    conversion_rate = CASE
      WHEN COALESCE(total_clicks, 0) > 0 THEN (v_active_count::NUMERIC / total_clicks * 100)
      ELSE 0
    END
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate monthly commissions
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(
  p_month INTEGER,
  p_year INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_referrer RECORD;
  v_company RECORD;
  v_plan_mrr NUMERIC;
  v_commission NUMERIC;
  v_multiplier NUMERIC;
  v_count INTEGER := 0;
BEGIN
  FOR v_referrer IN
    SELECT r.*, COALESCE(rt.commission_multiplier, 1.00) AS tier_multiplier
    FROM referrers r
    LEFT JOIN referral_tiers rt ON r.tier_id = rt.id
    WHERE r.is_active = true
  LOOP
    FOR v_company IN
      SELECT rc.company_id, sp.price_monthly, sp.name AS plan_name
      FROM referral_companies rc
      JOIN companies c ON rc.company_id = c.id
      JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
      WHERE rc.referrer_id = v_referrer.id
        AND rc.is_active = true
        AND c.status = 'active'
    LOOP
      v_plan_mrr := COALESCE(v_company.price_monthly, 0);
      v_multiplier := COALESCE(v_referrer.tier_multiplier, 1.00);

      IF v_referrer.commission_type = 'percentage' THEN
        v_commission := v_plan_mrr * (v_referrer.commission_value / 100) * v_multiplier;
      ELSE
        v_commission := v_referrer.commission_value * v_multiplier;
      END IF;

      INSERT INTO referral_commission_ledger (
        referrer_id, company_id, period_month, period_year,
        subscription_plan_name, plan_mrr,
        commission_type, commission_rate, tier_multiplier, commission_amount,
        status
      ) VALUES (
        v_referrer.id, v_company.company_id, p_month, p_year,
        v_company.plan_name, v_plan_mrr,
        v_referrer.commission_type, v_referrer.commission_value,
        v_multiplier, v_commission,
        'pending'
      )
      ON CONFLICT (referrer_id, company_id, period_month, period_year)
      DO UPDATE SET
        plan_mrr = EXCLUDED.plan_mrr,
        commission_amount = EXCLUDED.commission_amount,
        tier_multiplier = EXCLUDED.tier_multiplier,
        subscription_plan_name = EXCLUDED.subscription_plan_name,
        calculated_at = now();

      v_count := v_count + 1;
    END LOOP;

    UPDATE referrers SET
      total_earned = (
        SELECT COALESCE(SUM(commission_amount), 0)
        FROM referral_commission_ledger
        WHERE referrer_id = v_referrer.id AND status != 'cancelled'
      )
    WHERE id = v_referrer.id;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_referral_clicks_referrer_id ON public.referral_clicks(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON public.referral_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_commission_ledger_referrer ON public.referral_commission_ledger(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_commission_ledger_period ON public.referral_commission_ledger(period_year, period_month);
