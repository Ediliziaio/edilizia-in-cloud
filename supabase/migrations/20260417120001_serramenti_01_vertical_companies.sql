-- ════════════════════════════════════════════════════════════════════
-- FASE 1 — Vertical + onboarding (Preventivatore Serramentisti)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS vertical TEXT,
  ADD COLUMN IF NOT EXISTS verticals_secondari TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_vertical_completed BOOLEAN DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_vertical_check
    CHECK (vertical IS NULL OR vertical IN (
      'serramentista','tetti','bagno','ristrutturazione',
      'tende_da_sole','vetrate','caldaie','clima','generico'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_companies_vertical
  ON public.companies(vertical)
  WHERE vertical IS NOT NULL;

-- Backfill: aziende esistenti senza vertical → generico (ma onboarding non forzato)
UPDATE public.companies
  SET vertical = 'generico',
      onboarding_vertical_completed = true
  WHERE vertical IS NULL;
