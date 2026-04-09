-- Add cost tracking columns to render_bagno_sessions (missing from original migration)
ALTER TABLE public.render_bagno_sessions
  ADD COLUMN IF NOT EXISTS cost_real numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_billed numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_used text;
