-- ============================================================================
-- META ADS — Campaign Management schema
-- ============================================================================
-- Scopo: portare il modulo Pubblicità da "localStorage drafts" a persistenza DB
-- con pubblicazione reale via Meta Marketing API.
--
-- Tabelle introdotte (tutte gated da RLS company-scope):
--   • meta_campaigns         — campagne (bozza locale o sync da Meta)
--   • meta_ad_sets           — gruppi pubblico (1..n per campagna)
--   • meta_creatives         — creatività riutilizzabili (immagine/video/carosello)
--   • meta_ads               — annuncio = adset × creative
--   • ad_spend_guard         — cap di spesa configurabili per ad_account
--   • meta_conversion_pixel  — pixel + token CAPI cifrato
--   • ad_automation_rules    — regole if-then per autopilota (pausa/scala)
--   • ad_media               — libreria asset (immagini generate AI o upload)
--
-- Convenzioni:
--   • Tutte le tabelle hanno `id UUID DEFAULT gen_random_uuid()`
--   • FK su `companies(id) ON DELETE CASCADE`
--   • Trigger `set_updated_at()` (helper esistente) su updated_at
--   • Status testuali liberi (campaign.status mirrora i valori Meta)
--   • Campo `raw JSONB` per salvare il payload completo Meta (debugging)
--   • Soft delete via status='ARCHIVED', NO hard delete su entità live
--
-- Pattern RLS replicato da meta_assets:
--   • SELECT  : own company
--   • ALL     : own company AND (company_admin OR super_admin)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) meta_campaigns
-- --------------------------------------------------------------------------
-- Stato lifecycle:
--   draft        : bozza locale, mai inviata a Meta
--   review       : in attesa di approvazione titolare (budget > soglia)
--   published    : creata su Meta (status=PAUSED), ancora non attivata
--   active       : campagna live su Meta
--   paused       : pausa manuale o auto via spend_guard
--   archived     : archiviata (soft delete)
--   error        : ultima pubblicazione fallita

CREATE TABLE IF NOT EXISTS public.meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  ad_account_id UUID REFERENCES public.meta_ad_accounts(id) ON DELETE SET NULL,

  -- ID Meta (NULL finché in draft locale)
  meta_campaign_id TEXT,

  -- Configurazione campagna
  name TEXT NOT NULL,
  objective TEXT NOT NULL, -- OUTCOME_LEADS | OUTCOME_TRAFFIC | OUTCOME_AWARENESS | OUTCOME_ENGAGEMENT | OUTCOME_SALES
  status TEXT NOT NULL DEFAULT 'draft', -- draft | review | published | active | paused | archived | error
  buying_type TEXT NOT NULL DEFAULT 'AUCTION', -- AUCTION | RESERVED

  -- Budget — sempre in centesimi della currency dell'account
  budget_mode TEXT NOT NULL DEFAULT 'adset', -- adset (ABO) | campaign (CBO)
  daily_budget_cents INTEGER,
  lifetime_budget_cents INTEGER,

  -- Categorie speciali Meta (housing, employment, credit, social issues)
  special_ad_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  special_ad_category_country TEXT, -- es. 'IT'

  -- Date opzionali
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,

  -- Configurazione builder (snapshot del BuilderState frontend per riapertura)
  builder_state JSONB,

  -- Payload completo Meta (debugging + readback)
  raw JSONB,

  -- Tracking
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  publish_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT meta_campaigns_status_valid CHECK (status IN ('draft','review','published','active','paused','archived','error')),
  CONSTRAINT meta_campaigns_budget_mode_valid CHECK (budget_mode IN ('adset','campaign')),
  CONSTRAINT meta_campaigns_meta_id_unique UNIQUE (company_id, meta_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_company ON public.meta_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_status ON public.meta_campaigns(company_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_ad_account ON public.meta_campaigns(ad_account_id) WHERE ad_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_meta_id ON public.meta_campaigns(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_updated ON public.meta_campaigns(company_id, updated_at DESC);

-- --------------------------------------------------------------------------
-- 2) meta_ad_sets
-- --------------------------------------------------------------------------
-- Un ad set raggruppa: targeting + budget + ottimizzazione.

CREATE TABLE IF NOT EXISTS public.meta_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,

  meta_adset_id TEXT,

  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published | active | paused | archived | error

  -- Budget (centesimi)
  daily_budget_cents INTEGER,
  lifetime_budget_cents INTEGER,
  bid_amount_cents INTEGER,

  -- Ottimizzazione
  optimization_goal TEXT, -- LEAD_GENERATION | LINK_CLICKS | OFFSITE_CONVERSIONS | IMPRESSIONS | REACH | etc.
  billing_event TEXT DEFAULT 'IMPRESSIONS', -- IMPRESSIONS | LINK_CLICKS | THRUPLAY
  bid_strategy TEXT, -- LOWEST_COST_WITHOUT_CAP | LOWEST_COST_WITH_BID_CAP | COST_CAP

  -- Targeting completo (JSONB perché Meta usa schema enorme: geo, demographics, interests, behaviors, custom_audiences, etc.)
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Eventi conversione (per OUTCOME_LEADS)
  promoted_object JSONB,

  -- Posizionamenti (advantage_plus o manual)
  publisher_platforms TEXT[],
  facebook_positions TEXT[],
  instagram_positions TEXT[],

  -- Window di attribuzione
  attribution_spec JSONB,

  -- Date
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  publish_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meta_ad_sets_status_valid CHECK (status IN ('draft','published','active','paused','archived','error')),
  CONSTRAINT meta_ad_sets_meta_id_unique UNIQUE (company_id, meta_adset_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_company ON public.meta_ad_sets(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_campaign ON public.meta_ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_status ON public.meta_ad_sets(company_id, status);

-- --------------------------------------------------------------------------
-- 3) ad_media — libreria asset condivisa (creata PRIMA di meta_creatives perché FK)
-- --------------------------------------------------------------------------
-- Immagini/video generati AI o caricati manualmente, riutilizzabili.

CREATE TABLE IF NOT EXISTS public.ad_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image', -- image | video
  source TEXT NOT NULL DEFAULT 'upload', -- upload | ai_generated | meta_library

  -- Storage
  storage_bucket TEXT,
  storage_path TEXT,
  public_url TEXT,
  thumbnail_url TEXT,
  width_px INTEGER,
  height_px INTEGER,
  duration_seconds NUMERIC,
  file_size_bytes BIGINT,
  mime_type TEXT,

  -- Aspect ratio per Meta (1:1, 4:5, 9:16, 16:9)
  aspect_ratio TEXT,

  -- AI generation context
  ai_prompt TEXT,
  ai_model TEXT,
  ai_provider TEXT, -- 'openai-dalle3' | 'stability' | 'midjourney'
  ai_cost_eur_cents INTEGER,

  -- Stato sul Meta side (se uploaded)
  meta_image_hash TEXT,
  meta_video_id TEXT,
  uploaded_to_meta_at TIMESTAMPTZ,

  -- Tags per ricerca
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT ad_media_kind_valid CHECK (kind IN ('image','video')),
  CONSTRAINT ad_media_source_valid CHECK (source IN ('upload','ai_generated','meta_library'))
);

CREATE INDEX IF NOT EXISTS idx_ad_media_company ON public.ad_media(company_id);
CREATE INDEX IF NOT EXISTS idx_ad_media_kind ON public.ad_media(company_id, kind);
CREATE INDEX IF NOT EXISTS idx_ad_media_tags ON public.ad_media USING GIN (tags);

-- --------------------------------------------------------------------------
-- 4) meta_creatives — creatività riutilizzabili (1..n ads condividono)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meta_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES public.meta_ad_accounts(id) ON DELETE SET NULL,

  meta_creative_id TEXT,

  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'image', -- image | video | carousel | story | reel
  status TEXT NOT NULL DEFAULT 'draft',

  -- Copy
  title TEXT,
  body TEXT,
  hook TEXT,
  goal TEXT,
  call_to_action_type TEXT DEFAULT 'LEARN_MORE', -- LEARN_MORE | GET_QUOTE | SIGN_UP | etc.
  link_url TEXT,

  -- Media references
  image_hash TEXT, -- hash Meta dell'immagine uploaded
  video_id TEXT,   -- id video Meta
  media_id UUID REFERENCES public.ad_media(id) ON DELETE SET NULL,

  -- Prompt usato per generare AI (debug + rigenerazione)
  ai_prompt TEXT,
  ai_model TEXT,

  -- Object story spec completo Meta
  object_story_spec JSONB,
  asset_feed_spec JSONB,

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meta_creatives_format_valid CHECK (format IN ('image','video','carousel','story','reel')),
  CONSTRAINT meta_creatives_meta_id_unique UNIQUE (company_id, meta_creative_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_creatives_company ON public.meta_creatives(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_creatives_format ON public.meta_creatives(company_id, format);

-- --------------------------------------------------------------------------
-- 5) meta_ads — annuncio fisico (adset × creative)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meta_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  adset_id UUID NOT NULL REFERENCES public.meta_ad_sets(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES public.meta_creatives(id) ON DELETE RESTRICT,

  meta_ad_id TEXT,

  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',

  -- Tracking
  tracking_specs JSONB DEFAULT '[]'::jsonb,
  conversion_specs JSONB DEFAULT '[]'::jsonb,

  raw JSONB,
  last_published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  publish_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meta_ads_status_valid CHECK (status IN ('draft','published','active','paused','archived','error','disapproved')),
  CONSTRAINT meta_ads_meta_id_unique UNIQUE (company_id, meta_ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_company ON public.meta_ads(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_adset ON public.meta_ads(adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_creative ON public.meta_ads(creative_id);

-- --------------------------------------------------------------------------
-- 6) ad_spend_guard — cap di spesa configurabili
-- --------------------------------------------------------------------------
-- Un guard per ad_account (o 1 globale se ad_account_id IS NULL).

CREATE TABLE IF NOT EXISTS public.ad_spend_guard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,

  -- Cap
  monthly_cap_cents INTEGER NOT NULL DEFAULT 750000, -- default 7500 EUR/mese
  daily_cap_cents INTEGER NOT NULL DEFAULT 30000,    -- default 300 EUR/giorno

  -- Soglia singola campagna per richiedere approvazione
  campaign_approval_threshold_cents INTEGER NOT NULL DEFAULT 3000, -- 30 EUR/g per campagna

  -- Soglie alert
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80, -- alert al 80% del cap mensile
  autopause_on_daily_cap BOOLEAN NOT NULL DEFAULT true,
  autopause_on_monthly_cap BOOLEAN NOT NULL DEFAULT true,

  -- Email destinatario alert (override del titolare)
  alert_email TEXT,

  -- Ultima azione automatica
  last_alert_at TIMESTAMPTZ,
  last_autopause_at TIMESTAMPTZ,
  last_autopause_reason TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un solo guard per (company, ad_account). Se ad_account_id NULL → guard globale company.
  CONSTRAINT ad_spend_guard_unique_per_account UNIQUE (company_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_guard_company ON public.ad_spend_guard(company_id);

-- --------------------------------------------------------------------------
-- 7) meta_conversion_pixel — pixel + token CAPI
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meta_conversion_pixel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,

  pixel_id TEXT NOT NULL,
  pixel_name TEXT,

  -- CAPI token CIFRATO (usa pgcrypto/vault, mai plaintext)
  -- Per ora salviamo placeholder; la cifratura va fatta lato edge function
  capi_token_encrypted TEXT,

  -- Event quality tracking
  last_event_at TIMESTAMPTZ,
  event_match_quality_score NUMERIC(4,2), -- 0.00-10.00
  events_last_7d INTEGER DEFAULT 0,

  -- Dedup tracking
  pixel_events_last_24h INTEGER DEFAULT 0,
  capi_events_last_24h INTEGER DEFAULT 0,
  deduplication_rate NUMERIC(5,2), -- % eventi deduplicati

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meta_conversion_pixel_unique UNIQUE (company_id, pixel_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_conversion_pixel_company ON public.meta_conversion_pixel(company_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversion_pixel_active ON public.meta_conversion_pixel(company_id) WHERE is_active;

-- --------------------------------------------------------------------------
-- 8) ad_automation_rules — autopilot if-then
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ad_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- Scope: a chi applicare la regola
  scope_type TEXT NOT NULL DEFAULT 'campaign', -- campaign | adset | account
  scope_filter JSONB DEFAULT '{}'::jsonb, -- es. {status: 'active', objective: 'OUTCOME_LEADS'}

  -- Trigger: condizione
  -- JSONB schema: {metric: 'cpa', operator: '>', value: 30, window_days: 2}
  trigger JSONB NOT NULL,

  -- Action: cosa fare
  -- JSONB schema: {type: 'pause' | 'scale' | 'notify', params: {...}}
  action JSONB NOT NULL,

  -- Policy gate (riusa il sistema ai_company_action_permissions)
  requires_confirmation BOOLEAN NOT NULL DEFAULT true,

  is_enabled BOOLEAN NOT NULL DEFAULT false,
  last_evaluated_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_automation_rules_company ON public.ad_automation_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_ad_automation_rules_enabled ON public.ad_automation_rules(company_id, is_enabled) WHERE is_enabled;

-- ============================================================================
-- TRIGGERS UPDATED_AT (riusa public.set_updated_at() esistente)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    -- meta_campaigns
    EXECUTE 'DROP TRIGGER IF EXISTS trg_meta_campaigns_updated ON public.meta_campaigns';
    EXECUTE 'CREATE TRIGGER trg_meta_campaigns_updated BEFORE UPDATE ON public.meta_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- meta_ad_sets
    EXECUTE 'DROP TRIGGER IF EXISTS trg_meta_ad_sets_updated ON public.meta_ad_sets';
    EXECUTE 'CREATE TRIGGER trg_meta_ad_sets_updated BEFORE UPDATE ON public.meta_ad_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- meta_creatives
    EXECUTE 'DROP TRIGGER IF EXISTS trg_meta_creatives_updated ON public.meta_creatives';
    EXECUTE 'CREATE TRIGGER trg_meta_creatives_updated BEFORE UPDATE ON public.meta_creatives FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- meta_ads
    EXECUTE 'DROP TRIGGER IF EXISTS trg_meta_ads_updated ON public.meta_ads';
    EXECUTE 'CREATE TRIGGER trg_meta_ads_updated BEFORE UPDATE ON public.meta_ads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- ad_media
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ad_media_updated ON public.ad_media';
    EXECUTE 'CREATE TRIGGER trg_ad_media_updated BEFORE UPDATE ON public.ad_media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- ad_spend_guard
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ad_spend_guard_updated ON public.ad_spend_guard';
    EXECUTE 'CREATE TRIGGER trg_ad_spend_guard_updated BEFORE UPDATE ON public.ad_spend_guard FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- meta_conversion_pixel
    EXECUTE 'DROP TRIGGER IF EXISTS trg_meta_conversion_pixel_updated ON public.meta_conversion_pixel';
    EXECUTE 'CREATE TRIGGER trg_meta_conversion_pixel_updated BEFORE UPDATE ON public.meta_conversion_pixel FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
    -- ad_automation_rules
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ad_automation_rules_updated ON public.ad_automation_rules';
    EXECUTE 'CREATE TRIGGER trg_ad_automation_rules_updated BEFORE UPDATE ON public.ad_automation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- RLS — Row Level Security (pattern: own company SELECT, admin per ALL)
-- ============================================================================

ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_spend_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversion_pixel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_automation_rules ENABLE ROW LEVEL SECURITY;

-- meta_campaigns
DROP POLICY IF EXISTS "Users can view own company meta campaigns" ON public.meta_campaigns;
CREATE POLICY "Users can view own company meta campaigns"
  ON public.meta_campaigns FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company meta campaigns" ON public.meta_campaigns;
CREATE POLICY "Admins can manage own company meta campaigns"
  ON public.meta_campaigns FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- meta_ad_sets
DROP POLICY IF EXISTS "Users can view own company ad sets" ON public.meta_ad_sets;
CREATE POLICY "Users can view own company ad sets"
  ON public.meta_ad_sets FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company ad sets" ON public.meta_ad_sets;
CREATE POLICY "Admins can manage own company ad sets"
  ON public.meta_ad_sets FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- meta_creatives
DROP POLICY IF EXISTS "Users can view own company creatives" ON public.meta_creatives;
CREATE POLICY "Users can view own company creatives"
  ON public.meta_creatives FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company creatives" ON public.meta_creatives;
CREATE POLICY "Admins can manage own company creatives"
  ON public.meta_creatives FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- meta_ads
DROP POLICY IF EXISTS "Users can view own company ads" ON public.meta_ads;
CREATE POLICY "Users can view own company ads"
  ON public.meta_ads FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company ads" ON public.meta_ads;
CREATE POLICY "Admins can manage own company ads"
  ON public.meta_ads FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- ad_media
DROP POLICY IF EXISTS "Users can view own company ad media" ON public.ad_media;
CREATE POLICY "Users can view own company ad media"
  ON public.ad_media FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company ad media" ON public.ad_media;
CREATE POLICY "Admins can manage own company ad media"
  ON public.ad_media FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- ad_spend_guard
DROP POLICY IF EXISTS "Users can view own company spend guard" ON public.ad_spend_guard;
CREATE POLICY "Users can view own company spend guard"
  ON public.ad_spend_guard FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company spend guard" ON public.ad_spend_guard;
CREATE POLICY "Admins can manage own company spend guard"
  ON public.ad_spend_guard FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- meta_conversion_pixel
DROP POLICY IF EXISTS "Users can view own company pixel" ON public.meta_conversion_pixel;
CREATE POLICY "Users can view own company pixel"
  ON public.meta_conversion_pixel FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company pixel" ON public.meta_conversion_pixel;
CREATE POLICY "Admins can manage own company pixel"
  ON public.meta_conversion_pixel FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- ad_automation_rules
DROP POLICY IF EXISTS "Users can view own company automation rules" ON public.ad_automation_rules;
CREATE POLICY "Users can view own company automation rules"
  ON public.ad_automation_rules FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own company automation rules" ON public.ad_automation_rules;
CREATE POLICY "Admins can manage own company automation rules"
  ON public.ad_automation_rules FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- ============================================================================
-- COMMENT — documentazione tabelle
-- ============================================================================
COMMENT ON TABLE public.meta_campaigns IS 'Campagne Meta Ads (bozze locali + sync da Meta). Status lifecycle: draft → review → published → active/paused → archived.';
COMMENT ON TABLE public.meta_ad_sets IS 'Gruppi pubblico Meta. 1..n per campagna. Targeting JSONB segue lo schema completo Meta API.';
COMMENT ON TABLE public.meta_creatives IS 'Creatività riutilizzabili (1..n ads possono usare stessa creative).';
COMMENT ON TABLE public.meta_ads IS 'Annuncio Meta = adset × creative.';
COMMENT ON TABLE public.ad_media IS 'Libreria asset (immagini/video) generati AI o caricati. Caching dell image_hash Meta per riuso.';
COMMENT ON TABLE public.ad_spend_guard IS 'Cap di spesa configurabili per ad_account. Edge fn meta-ads-spend-check cron oraria controlla e auto-pausa.';
COMMENT ON TABLE public.meta_conversion_pixel IS 'Pixel CAPI per attribuzione server-side. Token cifrato.';
COMMENT ON TABLE public.ad_automation_rules IS 'Regole if-then per autopilot (pausa se CPA>X, scala se ROAS>Y). Gated da ai_company_action_permissions.';
