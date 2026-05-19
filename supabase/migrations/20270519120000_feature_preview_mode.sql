-- ============================================================================
-- v8.6.62 — Feature Preview Mode
--
-- Estende il sistema di feature gating da binario (enabled/disabled) a
-- tri-state (disabled / preview / enabled).
--
-- preview = utente vede UI completa ma in modalità demo: ogni azione che
-- modifica stato viene bloccata da un popup che invita a contattare il
-- consulente. Il popup apre un ticket di "unlock_request" già assegnato
-- al commerciale dell'azienda.
--
-- Concept commerciale: invece di nascondere ciò che non hanno, mostrare
-- cosa potrebbero usare → conversione sales-led.
--
-- Backward compat: TUTTE le righe esistenti diventano enabled/disabled in
-- base a is_enabled true/false. La colonna is_enabled rimane per compat
-- ma access_level diventa la sorgente preferita.
-- ============================================================================

-- ─── 1. Enum tipo access_level ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feature_access_level') THEN
    CREATE TYPE public.feature_access_level AS ENUM ('disabled', 'preview', 'enabled');
  END IF;
END $$;

-- ─── 2. Aggiunta colonna su company_feature_overrides ───────────────────────
ALTER TABLE public.company_feature_overrides
  ADD COLUMN IF NOT EXISTS access_level public.feature_access_level;

-- Backfill: is_enabled=true → 'enabled', false → 'disabled'
UPDATE public.company_feature_overrides
  SET access_level = CASE
    WHEN is_enabled THEN 'enabled'::public.feature_access_level
    ELSE 'disabled'::public.feature_access_level
  END
WHERE access_level IS NULL;

ALTER TABLE public.company_feature_overrides
  ALTER COLUMN access_level SET NOT NULL,
  ALTER COLUMN access_level SET DEFAULT 'enabled';

-- ─── 3. Aggiunta colonna su plan_feature_defaults ───────────────────────────
ALTER TABLE public.plan_feature_defaults
  ADD COLUMN IF NOT EXISTS access_level public.feature_access_level;

UPDATE public.plan_feature_defaults
  SET access_level = CASE
    WHEN is_enabled THEN 'enabled'::public.feature_access_level
    ELSE 'disabled'::public.feature_access_level
  END
WHERE access_level IS NULL;

ALTER TABLE public.plan_feature_defaults
  ALTER COLUMN access_level SET NOT NULL,
  ALTER COLUMN access_level SET DEFAULT 'enabled';

-- ─── 4. Aggiunta colonna su platform_feature_flags ──────────────────────────
-- Indica se la feature SUPPORTA il preview mode (es. moduli pure UI vs.
-- moduli che chiamano API esterne a pagamento dove preview non è gratis).
ALTER TABLE public.platform_feature_flags
  ADD COLUMN IF NOT EXISTS supports_preview boolean NOT NULL DEFAULT true;

-- Feature che NON supportano preview (chiamano API a pagamento per ogni run):
-- NB: in platform_feature_flags la colonna è "key", non "feature_key".
UPDATE public.platform_feature_flags
  SET supports_preview = false
WHERE key IN (
  'render_ai',           -- ogni render costa
  'agente_vocale',       -- ogni chiamata costa
  'ai_preventivo'        -- token AI a consumo
);

-- ─── 5. Tabella ticket "unlock_request" ─────────────────────────────────────
-- Viene creata una riga ogni volta che l'utente preme un'azione bloccata
-- in preview mode. Il consulente dell'azienda riceve notifica.
CREATE TABLE IF NOT EXISTS public.feature_unlock_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key     TEXT NOT NULL,
  requested_by    UUID REFERENCES auth.users(id),
  requested_email TEXT,
  message         TEXT,
  -- Dove l'utente stava cercando di fare l'azione (URL pagina + nome azione)
  source_url      TEXT,
  action_label    TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'declined')),
  -- Consulente assegnato (preso da companies.salesperson_id o similar)
  assigned_to     UUID REFERENCES auth.users(id),
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES auth.users(id),
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_unlock_req_company   ON public.feature_unlock_requests(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unlock_req_status    ON public.feature_unlock_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unlock_req_assigned  ON public.feature_unlock_requests(assigned_to, status);

ALTER TABLE public.feature_unlock_requests ENABLE ROW LEVEL SECURITY;

-- Read: utenti della company + super_admin + consulente assegnato
DROP POLICY IF EXISTS unlock_req_read ON public.feature_unlock_requests;
CREATE POLICY unlock_req_read
  ON public.feature_unlock_requests FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Insert: solo utenti della company (chiunque possa "richiedere sblocco")
DROP POLICY IF EXISTS unlock_req_insert ON public.feature_unlock_requests;
CREATE POLICY unlock_req_insert
  ON public.feature_unlock_requests FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

-- Update/Delete: solo super_admin + consulente assegnato
DROP POLICY IF EXISTS unlock_req_manage ON public.feature_unlock_requests;
CREATE POLICY unlock_req_manage
  ON public.feature_unlock_requests FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ─── 6. RPC resolve_company_feature aggiornata ──────────────────────────────
-- Ritorna anche access_level + supports_preview
-- DROP necessario: PostgreSQL non permette CREATE OR REPLACE se cambia return type.
DROP FUNCTION IF EXISTS public.resolve_company_feature(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.resolve_company_feature(
  p_company_id UUID,
  p_feature_key TEXT
)
RETURNS TABLE (
  is_enabled boolean,
  access_level public.feature_access_level,
  source TEXT,
  limit_value numeric,
  price_override numeric,
  expires_at TIMESTAMPTZ,
  supports_preview boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_override RECORD;
  v_plan_id UUID;
  v_plan_default RECORD;
  v_flag RECORD;
BEGIN
  -- 1. Override per company (priorità massima, rispetta expires_at)
  SELECT cfo.access_level, cfo.is_enabled, cfo.limit_value, cfo.price_override, cfo.expires_at
    INTO v_override
  FROM public.company_feature_overrides cfo
  WHERE cfo.company_id = p_company_id
    AND cfo.feature_key = p_feature_key
    AND (cfo.expires_at IS NULL OR cfo.expires_at > now());

  -- Flag info (per supports_preview) — colonna è "key" in platform_feature_flags
  SELECT pff.supports_preview INTO v_flag
  FROM public.platform_feature_flags pff
  WHERE pff.key = p_feature_key;

  IF FOUND THEN
    RETURN QUERY SELECT
      (v_override.access_level = 'enabled')::boolean AS is_enabled,
      v_override.access_level,
      'override'::text AS source,
      v_override.limit_value::numeric,
      v_override.price_override::numeric,
      v_override.expires_at,
      COALESCE(v_flag.supports_preview, true)::boolean;
    RETURN;
  END IF;

  -- 2. Plan default
  SELECT cs.plan_id INTO v_plan_id
  FROM public.company_subscriptions cs
  WHERE cs.company_id = p_company_id
    AND cs.status = 'active'
  ORDER BY cs.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NOT NULL THEN
    SELECT pfd.access_level, pfd.is_enabled, pfd.limit_value
      INTO v_plan_default
    FROM public.plan_feature_defaults pfd
    WHERE pfd.plan_id = v_plan_id
      AND pfd.feature_key = p_feature_key;

    IF FOUND THEN
      RETURN QUERY SELECT
        (v_plan_default.access_level = 'enabled')::boolean,
        v_plan_default.access_level,
        'plan_default'::text,
        v_plan_default.limit_value::numeric,
        NULL::numeric,
        NULL::TIMESTAMPTZ,
        COALESCE(v_flag.supports_preview, true)::boolean;
      RETURN;
    END IF;
  END IF;

  -- 3. Fallback: default_value della feature
  RETURN QUERY SELECT
    false::boolean,
    'disabled'::public.feature_access_level,
    'default'::text,
    NULL::numeric,
    NULL::numeric,
    NULL::TIMESTAMPTZ,
    COALESCE(v_flag.supports_preview, true)::boolean;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_company_feature(UUID, TEXT) TO authenticated;

-- ─── 7. Trigger sync: tieni is_enabled allineato con access_level ───────────
-- Se qualcuno modifica access_level dalla UI, is_enabled deve restare
-- coerente (true se enabled, false altrimenti) per back-compat con codice
-- legacy che ancora legge is_enabled.
CREATE OR REPLACE FUNCTION public.sync_is_enabled_with_access_level()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_enabled = (NEW.access_level = 'enabled');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cfo_sync_is_enabled ON public.company_feature_overrides;
CREATE TRIGGER trg_cfo_sync_is_enabled
  BEFORE INSERT OR UPDATE ON public.company_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_enabled_with_access_level();

DROP TRIGGER IF EXISTS trg_pfd_sync_is_enabled ON public.plan_feature_defaults;
CREATE TRIGGER trg_pfd_sync_is_enabled
  BEFORE INSERT OR UPDATE ON public.plan_feature_defaults
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_enabled_with_access_level();
