-- Migration: ai_usage_log table for Module 6 AI Usage Monitor
-- Tracks AI API consumption per company for cost monitoring

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  model text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'elevenlabs', 'other')),
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cost_eur numeric(10, 6) NOT NULL DEFAULT 0,
  feature text CHECK (feature IN ('chat', 'voice', 'doc_analysis', 'automation', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_view_ai_usage"
  ON public.ai_usage_log
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Index for aggregation queries
CREATE INDEX IF NOT EXISTS ai_usage_log_company_created_idx
  ON public.ai_usage_log (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx
  ON public.ai_usage_log (created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_log_provider_idx
  ON public.ai_usage_log (provider, created_at DESC);
