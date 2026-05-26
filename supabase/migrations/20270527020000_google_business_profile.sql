-- =============================================
-- Google Business Profile (GBP / Google My Business) integration
-- =============================================
-- 3 tabelle: connection, locations, reviews — modellate sul pattern
-- google_calendar_connections (encrypted tokens, RLS per company, audit).
--
-- API GBP utilizzate:
--   - mybusinessaccountmanagement.googleapis.com/v1/accounts
--   - mybusinessbusinessinformation.googleapis.com/v1/accounts/{a}/locations
--   - mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews
--   - PUT mybusiness.googleapis.com/v4/.../reviews/{r}/reply
--
-- Scope OAuth richiesto: https://www.googleapis.com/auth/business.manage
-- NB: l'endpoint v4 reviews richiede approvazione Google (partner program).
-- =============================================

BEGIN;

-- ── 1. Connection per company (OAuth + account + location selezionata) ──────
CREATE TABLE IF NOT EXISTS public.gbp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identità Google
  google_account_email TEXT,
  google_sub TEXT,

  -- Token cifrati (chiave = ENCRYPTION_KEY in _shared/encryption.ts)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  granted_scopes JSONB DEFAULT '[]'::jsonb,

  -- Account + location selezionati post-OAuth (impresa ha 1 sola scheda GBP tipica)
  gbp_account_id TEXT,           -- "accounts/123456"
  gbp_account_name TEXT,         -- "Edilizia Rossi SRL"
  gbp_location_id TEXT,          -- "locations/789012" (formato API v1)
  gbp_location_name TEXT,        -- "Edilizia Rossi — Milano centro"
  gbp_location_address TEXT,     -- per UI

  status TEXT NOT NULL DEFAULT 'disconnected',  -- 'connected' | 'disconnected' | 'error'
  last_sync_at TIMESTAMPTZ,
  last_sync_review_count INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id)  -- una sola connection per azienda
);

CREATE INDEX IF NOT EXISTS idx_gbp_connections_company ON public.gbp_connections(company_id);
CREATE INDEX IF NOT EXISTS idx_gbp_connections_status ON public.gbp_connections(status) WHERE status = 'connected';

COMMENT ON TABLE public.gbp_connections IS
  'Google Business Profile OAuth tokens + selected location per company. Una connection per azienda.';

-- ── 2. Locations disponibili (lista completa, prima della selezione) ─────────
-- Cache durante il flow di setup quando OAuth callback fetcha tutte le location.
CREATE TABLE IF NOT EXISTS public.gbp_locations_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.gbp_connections(id) ON DELETE CASCADE,
  gbp_account_id TEXT NOT NULL,
  gbp_location_id TEXT NOT NULL,
  display_name TEXT,
  address TEXT,
  primary_phone TEXT,
  primary_category TEXT,
  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, gbp_location_id)
);

CREATE INDEX IF NOT EXISTS idx_gbp_locations_cache_conn ON public.gbp_locations_cache(connection_id);

COMMENT ON TABLE public.gbp_locations_cache IS
  'Cache delle GBP location disponibili durante OAuth setup. UI lascia scegliere quale collegare.';

-- ── 3. Reviews sincronizzate ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gbp_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.gbp_connections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- ID Google della recensione (univoco)
  gbp_review_id TEXT NOT NULL,
  gbp_location_id TEXT NOT NULL,

  -- Contenuto
  reviewer_name TEXT,
  reviewer_profile_photo TEXT,
  star_rating SMALLINT,                       -- 1-5
  comment TEXT,
  create_time TIMESTAMPTZ,
  update_time TIMESTAMPTZ,

  -- Reply (se l'impresa ha già risposto)
  reply_comment TEXT,
  reply_update_time TIMESTAMPTZ,
  replied_via_eic BOOLEAN DEFAULT false,      -- true se reply scritta da EiC

  -- Stato in EiC
  triage_status TEXT DEFAULT 'new',            -- 'new' | 'acknowledged' | 'replied' | 'flagged' | 'ignored'
  triage_assigned_to UUID REFERENCES auth.users(id),
  triage_notes TEXT,

  raw JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(connection_id, gbp_review_id)
);

CREATE INDEX IF NOT EXISTS idx_gbp_reviews_company ON public.gbp_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_gbp_reviews_triage ON public.gbp_reviews(company_id, triage_status) WHERE triage_status = 'new';
CREATE INDEX IF NOT EXISTS idx_gbp_reviews_create_time ON public.gbp_reviews(company_id, create_time DESC);

COMMENT ON TABLE public.gbp_reviews IS
  'Google Business Profile reviews sincronizzate. Triage + reply tracking.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.gbp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gbp_locations_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gbp_reviews ENABLE ROW LEVEL SECURITY;

-- gbp_connections: solo membri azienda lo vedono
DROP POLICY IF EXISTS "gbp_connections_select" ON public.gbp_connections;
CREATE POLICY "gbp_connections_select" ON public.gbp_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id = gbp_connections.company_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "gbp_connections_insert" ON public.gbp_connections;
CREATE POLICY "gbp_connections_insert" ON public.gbp_connections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id = gbp_connections.company_id
    )
  );

DROP POLICY IF EXISTS "gbp_connections_update" ON public.gbp_connections;
CREATE POLICY "gbp_connections_update" ON public.gbp_connections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id = gbp_connections.company_id
    )
  );

DROP POLICY IF EXISTS "gbp_connections_delete" ON public.gbp_connections;
CREATE POLICY "gbp_connections_delete" ON public.gbp_connections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id = gbp_connections.company_id
    )
  );

-- gbp_locations_cache: RLS tramite connection
DROP POLICY IF EXISTS "gbp_locations_cache_all" ON public.gbp_locations_cache;
CREATE POLICY "gbp_locations_cache_all" ON public.gbp_locations_cache
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gbp_connections c
      JOIN public.profiles p ON p.company_id = c.company_id
      WHERE c.id = gbp_locations_cache.connection_id AND p.id = auth.uid()
    )
  );

-- gbp_reviews: solo membri azienda
DROP POLICY IF EXISTS "gbp_reviews_select" ON public.gbp_reviews;
CREATE POLICY "gbp_reviews_select" ON public.gbp_reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id = gbp_reviews.company_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "gbp_reviews_update" ON public.gbp_reviews;
CREATE POLICY "gbp_reviews_update" ON public.gbp_reviews
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id = gbp_reviews.company_id
    )
  );

-- INSERT/DELETE: solo service_role (edge functions). Niente policy = solo bypass via service key.

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_gbp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gbp_connections_updated_at ON public.gbp_connections;
CREATE TRIGGER trg_gbp_connections_updated_at
  BEFORE UPDATE ON public.gbp_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gbp();

DROP TRIGGER IF EXISTS trg_gbp_reviews_updated_at ON public.gbp_reviews;
CREATE TRIGGER trg_gbp_reviews_updated_at
  BEFORE UPDATE ON public.gbp_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_gbp();

COMMIT;
