-- S2.2 — ai_agent_pricing table
CREATE TABLE IF NOT EXISTS public.ai_agent_pricing (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             TEXT NOT NULL DEFAULT 'anthropic',
  label                TEXT,
  model_tier           TEXT NOT NULL DEFAULT 'standard'
                       CHECK (model_tier IN ('standard','advanced','voice')),
  cost_real_per_unit   NUMERIC(12,6) NOT NULL DEFAULT 0.003,
  cost_billed_per_unit NUMERIC(12,6) NOT NULL DEFAULT 0.01,
  markup_multiplier    NUMERIC(6,2)  NOT NULL DEFAULT 3.0,
  unit_label           TEXT NOT NULL DEFAULT 'chiamata',
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ai_agent_pricing (provider, label, model_tier, cost_real_per_unit, cost_billed_per_unit, markup_multiplier, unit_label)
VALUES
  ('anthropic',  'Agent Standard (Haiku)',  'standard', 0.002, 0.008, 4.0, 'chiamata'),
  ('anthropic',  'Agent Advanced (Sonnet)', 'advanced', 0.008, 0.025, 3.1, 'chiamata'),
  ('elevenlabs', 'Agente Vocale',           'voice',    0.006, 0.020, 3.3, 'minuto');

ALTER TABLE public.ai_agent_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_ai_pricing" ON public.ai_agent_pricing FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
