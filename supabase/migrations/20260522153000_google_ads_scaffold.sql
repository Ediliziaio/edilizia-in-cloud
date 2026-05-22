-- ============================================================================
-- GOOGLE ADS — Campaign Management scaffold
-- ============================================================================
-- Schema parallelo a meta_* per Google Ads. Permette di gestire campagne
-- multi-piattaforma dallo stesso modulo Pubblicità.
--
-- Differenze chiave vs Meta:
--   • Hierarchy: Customer → Campaign → Ad Group → Ad (no AdSet)
--   • Bidding: TARGET_CPA / TARGET_ROAS / MAXIMIZE_CONVERSIONS / etc.
--   • Network: SEARCH / DISPLAY / VIDEO / SHOPPING / PERFORMANCE_MAX
--   • Asset library: testi / titoli / descrizioni separati (Responsive Search Ads)
--
-- Pattern RLS identico a meta_campaigns.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) google_ads_accounts — Customer ID e link a integrations
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,

  customer_id TEXT NOT NULL, -- 123-456-7890 senza dash
  customer_name TEXT,
  currency TEXT, -- es. EUR
  time_zone TEXT, -- es. Europe/Rome
  manager_customer_id TEXT, -- MCC (My Client Center) parent
  is_manager BOOLEAN NOT NULL DEFAULT false,
  is_test_account BOOLEAN NOT NULL DEFAULT false,

  selected BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT google_ads_accounts_unique UNIQUE (company_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_accounts_company ON public.google_ads_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_accounts_integration ON public.google_ads_accounts(integration_id);

-- --------------------------------------------------------------------------
-- 2) google_ads_campaigns
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  google_account_id UUID REFERENCES public.google_ads_accounts(id) ON DELETE SET NULL,

  google_campaign_id TEXT, -- ID Google (riempito dopo publish)

  name TEXT NOT NULL,
  advertising_channel TEXT NOT NULL, -- SEARCH | DISPLAY | VIDEO | SHOPPING | PERFORMANCE_MAX | LOCAL_SERVICES
  status TEXT NOT NULL DEFAULT 'draft', -- draft | review | published | active | paused | archived | error

  -- Budget (centesimi della currency dell'account)
  daily_budget_cents INTEGER,
  -- Google supporta SHARED_BUDGET via budget_id
  shared_budget_id TEXT,

  -- Bidding
  bidding_strategy_type TEXT, -- TARGET_CPA | TARGET_ROAS | MAXIMIZE_CONVERSIONS | MAXIMIZE_CLICKS | MANUAL_CPC
  target_cpa_micros BIGINT, -- micros (1 EUR = 1_000_000 micros)
  target_roas NUMERIC(6,2),

  -- Date
  start_date DATE,
  end_date DATE,

  -- Targeting geografico (Google usa criteria diversi da Meta)
  geo_targets JSONB DEFAULT '[]'::jsonb, -- [{geo_target_constant_id, name}]
  language_targets TEXT[] DEFAULT ARRAY['it']::TEXT[],

  -- Network settings
  target_google_search BOOLEAN DEFAULT true,
  target_search_network BOOLEAN DEFAULT true,
  target_content_network BOOLEAN DEFAULT false,
  target_partner_search_network BOOLEAN DEFAULT false,

  -- Builder state per riapertura wizard
  builder_state JSONB,

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  publish_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT google_ads_campaigns_status_valid CHECK (status IN ('draft','review','published','active','paused','archived','error')),
  CONSTRAINT google_ads_campaigns_channel_valid CHECK (advertising_channel IN ('SEARCH','DISPLAY','VIDEO','SHOPPING','PERFORMANCE_MAX','LOCAL_SERVICES')),
  CONSTRAINT google_ads_campaigns_meta_id_unique UNIQUE (company_id, google_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_campaigns_company ON public.google_ads_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_campaigns_status ON public.google_ads_campaigns(company_id, status);
CREATE INDEX IF NOT EXISTS idx_google_ads_campaigns_account ON public.google_ads_campaigns(google_account_id);

-- --------------------------------------------------------------------------
-- 3) google_ad_groups (analogo Meta ad_sets)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ad_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.google_ads_campaigns(id) ON DELETE CASCADE,

  google_ad_group_id TEXT,

  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  ad_group_type TEXT, -- SEARCH_STANDARD | DISPLAY_STANDARD | etc.

  -- Bidding per ad group (può override campaign)
  cpc_bid_micros BIGINT,
  target_cpa_micros BIGINT,
  target_roas NUMERIC(6,2),

  -- Keywords (per SEARCH). Match types: BROAD | PHRASE | EXACT
  keywords JSONB DEFAULT '[]'::jsonb, -- [{text, match_type, cpc_bid_micros?}]
  negative_keywords JSONB DEFAULT '[]'::jsonb,

  -- Targeting audience (per DISPLAY/VIDEO)
  audience_targets JSONB,
  demographic_targets JSONB,

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  publish_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT google_ad_groups_status_valid CHECK (status IN ('draft','published','active','paused','archived','error')),
  CONSTRAINT google_ad_groups_meta_id_unique UNIQUE (company_id, google_ad_group_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ad_groups_company ON public.google_ad_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ad_groups_campaign ON public.google_ad_groups(campaign_id);

-- --------------------------------------------------------------------------
-- 4) google_ads_assets — testi/immagini/video riusabili
-- --------------------------------------------------------------------------
-- Google Ads usa "Asset" come oggetti riusabili (titoli, descrizioni, immagini, video).
CREATE TABLE IF NOT EXISTS public.google_ads_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  google_account_id UUID REFERENCES public.google_ads_accounts(id) ON DELETE SET NULL,

  google_asset_id TEXT,

  type TEXT NOT NULL, -- TEXT | IMAGE | VIDEO | YOUTUBE_VIDEO | CALLOUT | SITELINK | etc.
  name TEXT,

  -- Per asset di tipo TEXT (titoli e descrizioni)
  text_content TEXT,

  -- Per asset di tipo IMAGE
  ad_media_id UUID REFERENCES public.ad_media(id) ON DELETE SET NULL,

  -- Per YOUTUBE_VIDEO
  youtube_video_id TEXT,

  -- Performance scoring (Google misura quality)
  performance_label TEXT, -- BEST | GOOD | LOW | LEARNING | UNKNOWN

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT google_ads_assets_meta_id_unique UNIQUE (company_id, google_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_assets_company ON public.google_ads_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_assets_type ON public.google_ads_assets(company_id, type);

-- --------------------------------------------------------------------------
-- 5) google_ads — annuncio fisico (ad group × asset combination)
-- --------------------------------------------------------------------------
-- Responsive Search Ad: array di headlines + descriptions
-- Display Ad: image + headline + description
CREATE TABLE IF NOT EXISTS public.google_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_group_id UUID NOT NULL REFERENCES public.google_ad_groups(id) ON DELETE CASCADE,

  google_ad_id TEXT,

  name TEXT NOT NULL,
  ad_type TEXT NOT NULL, -- RESPONSIVE_SEARCH_AD | EXPANDED_TEXT_AD | RESPONSIVE_DISPLAY_AD | etc.
  status TEXT NOT NULL DEFAULT 'draft',

  -- Final URL (landing page)
  final_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  display_url TEXT,

  -- Responsive Search Ad components
  headlines JSONB DEFAULT '[]'::jsonb, -- [{text, asset_id?, performance_label?}]
  descriptions JSONB DEFAULT '[]'::jsonb,
  path1 TEXT,
  path2 TEXT,

  -- Per Display
  image_asset_ids UUID[] DEFAULT ARRAY[]::UUID[],
  logo_asset_ids UUID[] DEFAULT ARRAY[]::UUID[],

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  publish_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT google_ads_status_valid CHECK (status IN ('draft','published','active','paused','archived','error','disapproved')),
  CONSTRAINT google_ads_meta_id_unique UNIQUE (company_id, google_ad_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_company ON public.google_ads(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_ad_group ON public.google_ads(ad_group_id);

-- --------------------------------------------------------------------------
-- 6) google_ads_insights_cache (parallelo a meta_insights_cache)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.google_ads_campaigns(id) ON DELETE CASCADE,
  ad_group_id UUID REFERENCES public.google_ad_groups(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES public.google_ads(id) ON DELETE CASCADE,

  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,

  -- Metriche standard
  cost_micros BIGINT DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(6,4),
  average_cpc_micros BIGINT,
  conversions NUMERIC(10,2) DEFAULT 0,
  cost_per_conversion_micros BIGINT,
  conversion_value NUMERIC(10,2),

  -- Quality
  search_impression_share NUMERIC(5,2),
  search_top_impression_share NUMERIC(5,2),

  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_insights_company ON public.google_ads_insights_cache(company_id, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_insights_campaign ON public.google_ads_insights_cache(campaign_id, date_start DESC);

-- ============================================================================
-- TRIGGERS UPDATED_AT
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_google_ads_accounts_updated ON public.google_ads_accounts';
    EXECUTE 'CREATE TRIGGER trg_google_ads_accounts_updated BEFORE UPDATE ON public.google_ads_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS trg_google_ads_campaigns_updated ON public.google_ads_campaigns';
    EXECUTE 'CREATE TRIGGER trg_google_ads_campaigns_updated BEFORE UPDATE ON public.google_ads_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS trg_google_ad_groups_updated ON public.google_ad_groups';
    EXECUTE 'CREATE TRIGGER trg_google_ad_groups_updated BEFORE UPDATE ON public.google_ad_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS trg_google_ads_assets_updated ON public.google_ads_assets';
    EXECUTE 'CREATE TRIGGER trg_google_ads_assets_updated BEFORE UPDATE ON public.google_ads_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';

    EXECUTE 'DROP TRIGGER IF EXISTS trg_google_ads_updated ON public.google_ads';
    EXECUTE 'CREATE TRIGGER trg_google_ads_updated BEFORE UPDATE ON public.google_ads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- RLS — Row Level Security
-- ============================================================================

ALTER TABLE public.google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_insights_cache ENABLE ROW LEVEL SECURITY;

-- google_ads_accounts
DROP POLICY IF EXISTS "Users can view own company google ads accounts" ON public.google_ads_accounts;
CREATE POLICY "Users can view own company google ads accounts"
  ON public.google_ads_accounts FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company google ads accounts" ON public.google_ads_accounts;
CREATE POLICY "Admins can manage own company google ads accounts"
  ON public.google_ads_accounts FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- google_ads_campaigns
DROP POLICY IF EXISTS "Users can view own company google ads campaigns" ON public.google_ads_campaigns;
CREATE POLICY "Users can view own company google ads campaigns"
  ON public.google_ads_campaigns FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company google ads campaigns" ON public.google_ads_campaigns;
CREATE POLICY "Admins can manage own company google ads campaigns"
  ON public.google_ads_campaigns FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- google_ad_groups
DROP POLICY IF EXISTS "Users can view own company google ad groups" ON public.google_ad_groups;
CREATE POLICY "Users can view own company google ad groups"
  ON public.google_ad_groups FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company google ad groups" ON public.google_ad_groups;
CREATE POLICY "Admins can manage own company google ad groups"
  ON public.google_ad_groups FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- google_ads_assets
DROP POLICY IF EXISTS "Users can view own company google ads assets" ON public.google_ads_assets;
CREATE POLICY "Users can view own company google ads assets"
  ON public.google_ads_assets FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company google ads assets" ON public.google_ads_assets;
CREATE POLICY "Admins can manage own company google ads assets"
  ON public.google_ads_assets FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- google_ads
DROP POLICY IF EXISTS "Users can view own company google ads" ON public.google_ads;
CREATE POLICY "Users can view own company google ads"
  ON public.google_ads FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company google ads" ON public.google_ads;
CREATE POLICY "Admins can manage own company google ads"
  ON public.google_ads FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- google_ads_insights_cache
DROP POLICY IF EXISTS "Users can view own company google ads insights" ON public.google_ads_insights_cache;
CREATE POLICY "Users can view own company google ads insights"
  ON public.google_ads_insights_cache FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

COMMENT ON TABLE public.google_ads_campaigns IS 'Campagne Google Ads (scaffold v1). Multi-channel: SEARCH/DISPLAY/VIDEO/SHOPPING/PERFORMANCE_MAX.';
COMMENT ON TABLE public.google_ad_groups IS 'Ad Groups Google = analogo Meta ad_sets. Per SEARCH ospitano le keywords.';
COMMENT ON TABLE public.google_ads_assets IS 'Asset Google riusabili: text headlines, descriptions, immagini, video.';
COMMENT ON TABLE public.google_ads IS 'Annunci Google. Responsive Search/Display Ad mix di asset.';
