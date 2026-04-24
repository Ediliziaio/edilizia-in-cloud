-- Sales OS Sprint 4 — Lead scoring config per-company
-- Consente alle aziende di personalizzare i pesi del lead scoring
-- (ICP + Behavioral) senza toccare il codice. Se non esiste row la
-- TS function usa i defaults hardcoded.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_scoring_config (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- ICP weights (0-50 di budget totale)
  weight_company_name INT NOT NULL DEFAULT 5 CHECK (weight_company_name BETWEEN 0 AND 50),
  weight_phone INT NOT NULL DEFAULT 5 CHECK (weight_phone BETWEEN 0 AND 50),
  weight_address INT NOT NULL DEFAULT 3 CHECK (weight_address BETWEEN 0 AND 50),
  weight_city INT NOT NULL DEFAULT 5 CHECK (weight_city BETWEEN 0 AND 50),
  -- Behavioral weights (0-50 di budget totale)
  weight_open_opportunity INT NOT NULL DEFAULT 15 CHECK (weight_open_opportunity BETWEEN 0 AND 50),
  weight_recent_activity INT NOT NULL DEFAULT 10 CHECK (weight_recent_activity BETWEEN 0 AND 50),
  points_per_activity INT NOT NULL DEFAULT 2 CHECK (points_per_activity BETWEEN 0 AND 20),
  max_activity_points INT NOT NULL DEFAULT 20 CHECK (max_activity_points BETWEEN 0 AND 50),
  max_history_points INT NOT NULL DEFAULT 5 CHECK (max_history_points BETWEEN 0 AND 50),
  -- Source scores (JSONB: { "referral": 15, "fiera": 10, ... })
  source_scores JSONB NOT NULL DEFAULT '{
    "referral": 15,
    "passaparola": 15,
    "cliente_esistente": 12,
    "fiera": 10,
    "linkedin": 8,
    "sito_web": 8,
    "campagna": 7,
    "email": 5,
    "social": 5,
    "chiamata_fredda": 3,
    "cold_call": 3
  }'::jsonb,
  -- Tier thresholds sul ICP score (0-50)
  tier_a_threshold INT NOT NULL DEFAULT 40 CHECK (tier_a_threshold BETWEEN 0 AND 50),
  tier_b_threshold INT NOT NULL DEFAULT 25 CHECK (tier_b_threshold BETWEEN 0 AND 50),
  tier_c_threshold INT NOT NULL DEFAULT 10 CHECK (tier_c_threshold BETWEEN 0 AND 50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.lead_scoring_config ENABLE ROW LEVEL SECURITY;

-- Policy: membri company leggono la propria config
DROP POLICY IF EXISTS "lead_scoring_config_read" ON public.lead_scoring_config;
CREATE POLICY "lead_scoring_config_read"
  ON public.lead_scoring_config FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Policy: solo company_admin + super_admin possono modificare
DROP POLICY IF EXISTS "lead_scoring_config_upsert" ON public.lead_scoring_config;
CREATE POLICY "lead_scoring_config_upsert"
  ON public.lead_scoring_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('company_admin', 'super_admin')
    )
    AND (
      company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('company_admin', 'super_admin')
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.lead_scoring_config_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_scoring_config_touch ON public.lead_scoring_config;
CREATE TRIGGER trg_lead_scoring_config_touch
  BEFORE UPDATE ON public.lead_scoring_config
  FOR EACH ROW EXECUTE FUNCTION public.lead_scoring_config_touch();

COMMIT;
