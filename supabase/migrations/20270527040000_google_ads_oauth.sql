-- =============================================
-- Google Ads OAuth + customer tracking
-- =============================================
-- Modellato sui pattern già consolidati (google_calendar_connections, gbp).
-- API: googleads.googleapis.com/v17/customers/{id}/...
-- Scope OAuth: https://www.googleapis.com/auth/adwords
--
-- Richiede inoltre un Developer Token Google Ads approvato
-- (NON è una credenziale OAuth — si chiede in Google Ads Manager Center).
-- =============================================

BEGIN;

-- ── 1. Connection per azienda ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_ads_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identità Google
  google_account_email TEXT,
  google_sub TEXT,

  -- Token cifrati
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  granted_scopes JSONB DEFAULT '[]'::jsonb,

  -- Account Google Ads selezionato
  manager_customer_id TEXT,      -- MCC se si usa un Manager Account (login-customer-id header)
  customer_id TEXT,              -- Customer ID effettivo della campagna (10 cifre senza trattini)
  customer_descriptive_name TEXT,
  customer_currency_code TEXT,
  customer_time_zone TEXT,
  is_manager BOOLEAN DEFAULT false,
  is_test_account BOOLEAN DEFAULT false,

  status TEXT NOT NULL DEFAULT 'disconnected',  -- 'connected' | 'disconnected' | 'error' | 'needs_customer_selection'
  last_sync_at TIMESTAMPTZ,
  last_sync_campaign_count INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_conn_company ON public.google_ads_connections(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_conn_customer ON public.google_ads_connections(customer_id) WHERE customer_id IS NOT NULL;

-- ── 2. Cache dei customer disponibili (post-OAuth) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.google_ads_customers_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.google_ads_connections(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  descriptive_name TEXT,
  currency_code TEXT,
  time_zone TEXT,
  is_manager BOOLEAN DEFAULT false,
  is_test_account BOOLEAN DEFAULT false,
  manager_customer_id TEXT,
  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_cust_cache_conn ON public.google_ads_customers_cache(connection_id);

-- ── 3. Campagne sincronizzate ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.google_ads_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  google_campaign_id TEXT NOT NULL,
  google_customer_id TEXT NOT NULL,

  name TEXT,
  status TEXT,             -- ENABLED, PAUSED, REMOVED
  advertising_channel_type TEXT,  -- SEARCH, DISPLAY, VIDEO, SHOPPING, PMAX
  bidding_strategy_type TEXT,
  start_date DATE,
  end_date DATE,

  -- Budget
  daily_budget_micros BIGINT,    -- in micro EUR (1e6 = 1 EUR)
  total_budget_micros BIGINT,

  -- Insights aggregati (last 30 days, updated by sync-insights)
  last30_impressions BIGINT DEFAULT 0,
  last30_clicks BIGINT DEFAULT 0,
  last30_cost_micros BIGINT DEFAULT 0,
  last30_conversions DOUBLE PRECISION DEFAULT 0,
  last30_conversion_value_micros BIGINT DEFAULT 0,
  insights_updated_at TIMESTAMPTZ,

  raw JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(connection_id, google_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_camp_company ON public.google_ads_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_camp_status ON public.google_ads_campaigns(company_id, status) WHERE status = 'ENABLED';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.google_ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_customers_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_ads_conn_all" ON public.google_ads_connections;
CREATE POLICY "google_ads_conn_all" ON public.google_ads_connections
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = google_ads_connections.company_id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin')
  );

DROP POLICY IF EXISTS "google_ads_cust_cache_all" ON public.google_ads_customers_cache;
CREATE POLICY "google_ads_cust_cache_all" ON public.google_ads_customers_cache
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_connections c
      JOIN public.profiles p ON p.company_id = c.company_id
      WHERE c.id = google_ads_customers_cache.connection_id AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "google_ads_camp_select" ON public.google_ads_campaigns;
CREATE POLICY "google_ads_camp_select" ON public.google_ads_campaigns
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = google_ads_campaigns.company_id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin')
  );

-- updated_at triggers (riutilizza la function da gbp migration)
DROP TRIGGER IF EXISTS trg_google_ads_conn_updated_at ON public.google_ads_connections;
CREATE TRIGGER trg_google_ads_conn_updated_at
  BEFORE UPDATE ON public.google_ads_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gbp();

DROP TRIGGER IF EXISTS trg_google_ads_camp_updated_at ON public.google_ads_campaigns;
CREATE TRIGGER trg_google_ads_camp_updated_at
  BEFORE UPDATE ON public.google_ads_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gbp();

COMMIT;
