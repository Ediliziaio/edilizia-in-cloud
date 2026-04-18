-- FASE 10.1 — Estensione schema bundle per famiglie serramentista
-- Aggiunge family_id + axis_selections + misure default + vano label a bundle_voci.
-- Aggiunge vertical + tipo_lavoro a bundle_prodotti per filtraggio wizard.
-- Idempotente.

-- ── bundle_voci ──────────────────────────────────────────────────────────────

ALTER TABLE public.bundle_voci
  ADD COLUMN IF NOT EXISTS family_id UUID
    REFERENCES public.article_families(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS axis_selections JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS larghezza_mm_default INTEGER,
  ADD COLUMN IF NOT EXISTS altezza_mm_default INTEGER,
  ADD COLUMN IF NOT EXISTS vano_label TEXT;

-- Il constraint legacy esige prodotto_id OR tariffa_id: rilassiamo per includere family_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bundle_voci_ha_item' AND conrelid = 'public.bundle_voci'::regclass
  ) THEN
    ALTER TABLE public.bundle_voci DROP CONSTRAINT bundle_voci_ha_item;
  END IF;
END $$;

ALTER TABLE public.bundle_voci
  ADD CONSTRAINT bundle_voci_ha_item CHECK (
    prodotto_id IS NOT NULL OR tariffa_id IS NOT NULL OR family_id IS NOT NULL
  );

-- ── bundle_prodotti ─────────────────────────────────────────────────────────

ALTER TABLE public.bundle_prodotti
  ADD COLUMN IF NOT EXISTS vertical TEXT,
  ADD COLUMN IF NOT EXISTS tipo_lavoro TEXT
    CHECK (tipo_lavoro IS NULL OR tipo_lavoro IN ('sostituzione','nuova','ristrutturazione')),
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

-- ── Indici ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bundle_voci_family
  ON public.bundle_voci(family_id)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bundle_prodotti_vertical
  ON public.bundle_prodotti(company_id, vertical)
  WHERE vertical IS NOT NULL;
