-- ============================================================================
-- META CAMPAIGN VERSIONS — history snapshot ogni save
-- ============================================================================
-- Permette di vedere chi ha modificato cosa e quando, e ripristinare versioni
-- precedenti del builder_state.
--
-- Strategy: TRIGGER su UPDATE di meta_campaigns che salva uno snapshot
--           del vecchio builder_state in meta_campaign_versions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_campaign_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  /** Versione progressiva (1, 2, 3, ...) */
  version_number INTEGER NOT NULL,

  /** Snapshot completo del builder_state in quel momento */
  builder_state JSONB,

  /** Snapshot di campi rilevanti */
  name TEXT,
  status TEXT,
  daily_budget_cents INTEGER,

  /** Chi ha fatto la modifica */
  modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  /** Note opzionali ("Aggiornato budget", "Cambio template", etc.) */
  change_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meta_campaign_versions_unique UNIQUE (campaign_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaign_versions_campaign ON public.meta_campaign_versions(campaign_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_versions_company ON public.meta_campaign_versions(company_id);

-- ============================================================================
-- TRIGGER — snapshot prima UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.snapshot_campaign_version()
RETURNS TRIGGER AS $$
DECLARE
  v_next_version INTEGER;
BEGIN
  -- Salva snapshot SOLO se il builder_state è cambiato (evita rumore)
  IF OLD.builder_state IS DISTINCT FROM NEW.builder_state
     OR OLD.name IS DISTINCT FROM NEW.name
     OR OLD.daily_budget_cents IS DISTINCT FROM NEW.daily_budget_cents
     OR OLD.status IS DISTINCT FROM NEW.status THEN

    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO v_next_version
      FROM public.meta_campaign_versions
      WHERE campaign_id = OLD.id;

    INSERT INTO public.meta_campaign_versions (
      campaign_id, company_id, version_number,
      builder_state, name, status, daily_budget_cents,
      modified_by
    )
    VALUES (
      OLD.id, OLD.company_id, v_next_version,
      OLD.builder_state, OLD.name, OLD.status, OLD.daily_budget_cents,
      auth.uid()
    );

    -- Cleanup: mantieni solo le ultime 50 versioni
    DELETE FROM public.meta_campaign_versions
      WHERE campaign_id = OLD.id
      AND version_number <= (
        SELECT MAX(version_number) - 50
        FROM public.meta_campaign_versions
        WHERE campaign_id = OLD.id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_meta_campaigns_snapshot ON public.meta_campaigns;
CREATE TRIGGER trg_meta_campaigns_snapshot
  BEFORE UPDATE ON public.meta_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_campaign_version();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.meta_campaign_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company campaign versions" ON public.meta_campaign_versions;
CREATE POLICY "Users can view own company campaign versions"
  ON public.meta_campaign_versions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- I trigger scrivono con SECURITY DEFINER, no INSERT da utenti diretti
DROP POLICY IF EXISTS "No direct insert on campaign versions" ON public.meta_campaign_versions;
CREATE POLICY "No direct insert on campaign versions"
  ON public.meta_campaign_versions FOR INSERT TO authenticated
  WITH CHECK (false);

COMMENT ON TABLE public.meta_campaign_versions IS 'History snapshot di meta_campaigns. Auto-popolata via trigger. Max 50 versioni per campagna.';
