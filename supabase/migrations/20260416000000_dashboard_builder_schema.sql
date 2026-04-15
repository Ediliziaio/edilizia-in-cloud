-- ════════════════════════════════════════════════════════════════
-- Dashboard Builder v1 — Sprint 1.10 + 1.11
-- Tabelle + RLS per il nuovo dashboard builder custom.
--
-- Tutte le tabelle sono isolate dal resto del sistema:
--   • nessun trigger su tabelle esistenti
--   • nessuna FK da tabelle esistenti verso queste
--   • feature flag OFF di default per tutte le company
--
-- La dashboard attuale (hard-coded in CompanyDashboard.tsx) continua
-- a funzionare indipendentemente da questa migration.
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. metric_catalog — catalogo metriche gestito dai dev
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metric_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('currency','count','percent','duration','ratio')),
  default_aggregation TEXT NOT NULL DEFAULT 'sum'
    CHECK (default_aggregation IN ('sum','avg','count','min','max','none')),
  allowed_aggregations TEXT[] NOT NULL DEFAULT ARRAY['sum'],
  allowed_dimensions TEXT[] NOT NULL DEFAULT ARRAY['none'],
  sql_template TEXT NOT NULL,
  requires_role TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.metric_catalog IS
  'Catalogo metriche invocabili dal dashboard builder. Gestito dai dev via migration, mai modificato dall''utente.';

ALTER TABLE public.metric_catalog ENABLE ROW LEVEL SECURITY;

-- Lettura: tutti gli autenticati (il catalogo è metadati pubblici all'interno del sistema)
DROP POLICY IF EXISTS "metric_catalog_read_authenticated" ON public.metric_catalog;
CREATE POLICY "metric_catalog_read_authenticated"
  ON public.metric_catalog FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Scrittura: nessuna policy = solo service_role (via migration)

-- ──────────────────────────────────────────────────────────────────
-- 2. dashboards — metadati dashboard
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'personal'
    CHECK (scope = 'personal' OR scope = 'company' OR scope LIKE 'role:%'),
  is_default BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_company ON public.dashboards(company_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON public.dashboards(owner_id);

COMMENT ON TABLE public.dashboards IS
  'Dashboard personalizzate. Scope: personal (solo owner), company (tutta azienda), role:<ruolo> (membri con quel ruolo).';

ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;

-- SELECT: company match + scope visibility
DROP POLICY IF EXISTS "dashboards_read" ON public.dashboards;
CREATE POLICY "dashboards_read"
  ON public.dashboards FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      scope = 'company'
      OR (scope = 'personal' AND owner_id = auth.uid())
      OR (scope LIKE 'role:%' AND public.has_role(auth.uid(), SUBSTRING(scope FROM 6)::app_role))
    )
  );

-- INSERT: membro della company, owner_id = self
DROP POLICY IF EXISTS "dashboards_insert" ON public.dashboards;
CREATE POLICY "dashboards_insert"
  ON public.dashboards FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND owner_id = auth.uid()
  );

-- UPDATE: solo owner o admin company
DROP POLICY IF EXISTS "dashboards_update" ON public.dashboards;
CREATE POLICY "dashboards_update"
  ON public.dashboards FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (owner_id = auth.uid() OR public.has_role(auth.uid(), 'company_admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
  );

-- DELETE: solo owner o admin company
DROP POLICY IF EXISTS "dashboards_delete" ON public.dashboards;
CREATE POLICY "dashboards_delete"
  ON public.dashboards FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (owner_id = auth.uid() OR public.has_role(auth.uid(), 'company_admin'::app_role))
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.dashboards_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS dashboards_updated_at ON public.dashboards;
CREATE TRIGGER dashboards_updated_at BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.dashboards_set_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- 3. dashboard_versions — snapshot layout immutabile
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  version INT NOT NULL,
  layout JSONB NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  UNIQUE (dashboard_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_versions_current_unique
  ON public.dashboard_versions(dashboard_id) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_dashboard_versions_dashboard
  ON public.dashboard_versions(dashboard_id, created_at DESC);

COMMENT ON TABLE public.dashboard_versions IS
  'Ogni save = nuova versione. Al massimo una riga is_current=true per dashboard. UPDATE bloccato (immutabile).';

ALTER TABLE public.dashboard_versions ENABLE ROW LEVEL SECURITY;

-- SELECT: via dashboard policy (se vedi la dashboard, vedi le versioni)
DROP POLICY IF EXISTS "dashboard_versions_read" ON public.dashboard_versions;
CREATE POLICY "dashboard_versions_read"
  ON public.dashboard_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id)
  );

-- INSERT: chi può vedere la dashboard + se ne è owner o ha company_admin
DROP POLICY IF EXISTS "dashboard_versions_insert" ON public.dashboard_versions;
CREATE POLICY "dashboard_versions_insert"
  ON public.dashboard_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id
        AND d.company_id = public.get_user_company_id(auth.uid())
        AND (d.owner_id = auth.uid() OR public.has_role(auth.uid(), 'company_admin'::app_role))
    )
  );

-- UPDATE bloccato (immutabile) — trigger di protezione
CREATE OR REPLACE FUNCTION public.dashboard_versions_prevent_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Permetti SOLO la modifica del flag is_current (per switch versione attiva)
  IF OLD.layout IS DISTINCT FROM NEW.layout
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.dashboard_id IS DISTINCT FROM NEW.dashboard_id
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'dashboard_versions is immutable (only is_current and note can change)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dashboard_versions_immutable ON public.dashboard_versions;
CREATE TRIGGER dashboard_versions_immutable BEFORE UPDATE ON public.dashboard_versions
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_versions_prevent_update();

-- UPDATE policy: solo per toggle is_current (rollback versione)
DROP POLICY IF EXISTS "dashboard_versions_toggle_current" ON public.dashboard_versions;
CREATE POLICY "dashboard_versions_toggle_current"
  ON public.dashboard_versions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id
        AND d.company_id = public.get_user_company_id(auth.uid())
        AND (d.owner_id = auth.uid() OR public.has_role(auth.uid(), 'company_admin'::app_role))
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 4. dashboard_user_prefs — ultima dashboard aperta per utente
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_user_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE SET NULL,
  last_opened_at TIMESTAMPTZ
);

ALTER TABLE public.dashboard_user_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_user_prefs_self_all" ON public.dashboard_user_prefs;
CREATE POLICY "dashboard_user_prefs_self_all"
  ON public.dashboard_user_prefs FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- 5. company_features — feature flag per company
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_features (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (company_id, feature_key)
);

COMMENT ON TABLE public.company_features IS
  'Feature flag per abilitare/disabilitare moduli per company. Modificabile solo da super_admin via RPC dedicata.';

ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

-- SELECT: membri della company
DROP POLICY IF EXISTS "company_features_read" ON public.company_features;
CREATE POLICY "company_features_read"
  ON public.company_features FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Scrittura: solo super_admin (no policy authenticated, solo service_role + super_admin)
DROP POLICY IF EXISTS "company_features_write_super" ON public.company_features;
CREATE POLICY "company_features_write_super"
  ON public.company_features FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ──────────────────────────────────────────────────────────────────
-- SEED feature flag OFF per tutte le company esistenti
-- ──────────────────────────────────────────────────────────────────
INSERT INTO public.company_features (company_id, feature_key, enabled)
SELECT c.id, 'dashboard_builder_v1', false
FROM public.companies c
ON CONFLICT (company_id, feature_key) DO NOTHING;
