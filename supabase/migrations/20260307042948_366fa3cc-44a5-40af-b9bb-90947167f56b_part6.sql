-- Add missing columns to ai_agent_credits
ALTER TABLE public.ai_agent_credits
  ADD COLUMN IF NOT EXISTS cost_per_minute_platform NUMERIC NOT NULL DEFAULT 0.08,
  ADD COLUMN IF NOT EXISTS cost_per_minute_billed NUMERIC NOT NULL DEFAULT 0.16;
