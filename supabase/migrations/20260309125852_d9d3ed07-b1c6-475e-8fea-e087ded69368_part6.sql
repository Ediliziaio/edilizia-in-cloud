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
