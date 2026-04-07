-- IMP-6: AI Usage Alert Soglie
-- Tabella configurazione soglie per piano + log alert scattati

CREATE TABLE IF NOT EXISTS public.ai_usage_thresholds (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       text         NOT NULL,  -- 'basic' | 'pro' | 'enterprise' | '__default__'
  daily_limit_eur  numeric(10,2) NOT NULL DEFAULT 5.00,
  monthly_limit_eur numeric(10,2) NOT NULL DEFAULT 50.00,
  alert_channels text[]      NOT NULL DEFAULT '{"email"}',
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_thresholds_plan_unique UNIQUE (plan_id)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_alerts (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  threshold_type text         NOT NULL CHECK (threshold_type IN ('daily','monthly')),
  usage_eur      numeric(10,2) NOT NULL,
  limit_eur      numeric(10,2) NOT NULL,
  alerted_at     timestamptz  NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);

-- Default thresholds
INSERT INTO public.ai_usage_thresholds (plan_id, daily_limit_eur, monthly_limit_eur)
VALUES
  ('__default__', 5.00,  50.00),
  ('basic',       3.00,  25.00),
  ('pro',         10.00, 100.00),
  ('enterprise',  25.00, 250.00)
ON CONFLICT (plan_id) DO NOTHING;

-- RLS
ALTER TABLE public.ai_usage_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_alerts    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_ai_thresholds"
  ON public.ai_usage_thresholds FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "super_admin_ai_alerts"
  ON public.ai_usage_alerts FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Indice per query frequente
CREATE INDEX IF NOT EXISTS ai_usage_alerts_company_idx
  ON public.ai_usage_alerts (company_id, alerted_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_alerts_unresolved_idx
  ON public.ai_usage_alerts (alerted_at DESC)
  WHERE resolved_at IS NULL;
