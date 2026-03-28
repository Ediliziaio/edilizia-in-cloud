-- ================================================================
-- SISTEMA CREDITI PAY-PER-USE edilizia.io
-- ================================================================

-- 1. Platform Pricing (costi per combinazione LLM+TTS)
CREATE TABLE IF NOT EXISTS public.platform_pricing (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  llm_model           TEXT NOT NULL,
  tts_model           TEXT NOT NULL,
  cost_real_per_min   DECIMAL(10,6) NOT NULL,
  cost_billed_per_min DECIMAL(10,6) NOT NULL,
  markup_multiplier   DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  is_active           BOOLEAN DEFAULT true,
  label               TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_by          UUID,
  UNIQUE(llm_model, tts_model)
);
