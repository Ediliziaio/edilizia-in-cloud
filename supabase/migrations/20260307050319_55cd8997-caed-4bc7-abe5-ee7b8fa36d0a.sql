
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

-- 2. AI Credits (portafoglio per azienda)
CREATE TABLE IF NOT EXISTS public.ai_credits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID UNIQUE NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  balance_eur              DECIMAL(10,4) DEFAULT 0,
  total_recharged_eur      DECIMAL(10,4) DEFAULT 0,
  total_spent_eur          DECIMAL(10,4) DEFAULT 0,
  auto_recharge_enabled    BOOLEAN DEFAULT false,
  auto_recharge_threshold  DECIMAL(10,4) DEFAULT 5.00,
  auto_recharge_amount     DECIMAL(10,4) DEFAULT 20.00,
  auto_recharge_method     TEXT,
  auto_recharge_payment_ref TEXT,
  alert_threshold_eur      DECIMAL(10,4) DEFAULT 5.00,
  alert_email_sent_at      TIMESTAMPTZ,
  calls_blocked            BOOLEAN DEFAULT false,
  blocked_at               TIMESTAMPTZ,
  blocked_reason           TEXT,
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- 3. AI Credit Topups (storico ricariche)
CREATE TABLE IF NOT EXISTS public.ai_credit_topups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id),
  amount_eur      DECIMAL(10,4) NOT NULL,
  type            TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'pending',
  payment_method  TEXT,
  payment_ref     TEXT,
  invoice_number  TEXT,
  notes           TEXT,
  triggered_by    UUID,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AI Credit Usage (consumo per conversazione)
CREATE TABLE IF NOT EXISTS public.ai_credit_usage (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id),
  conversation_id     UUID REFERENCES public.ai_agent_conversations(id) ON DELETE SET NULL,
  agent_id            UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  duration_sec        INTEGER NOT NULL,
  duration_min        DECIMAL(10,4) NOT NULL,
  llm_model           TEXT NOT NULL,
  tts_model           TEXT NOT NULL,
  cost_real_per_min   DECIMAL(10,6) NOT NULL,
  cost_billed_per_min DECIMAL(10,6) NOT NULL,
  cost_real_total     DECIMAL(10,4) NOT NULL,
  cost_billed_total   DECIMAL(10,4) NOT NULL,
  margin_total        DECIMAL(10,4) NOT NULL,
  balance_before      DECIMAL(10,4) NOT NULL,
  balance_after       DECIMAL(10,4) NOT NULL,
  call_direction      TEXT DEFAULT 'inbound',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Add tts_model to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS tts_model TEXT DEFAULT 'eleven_multilingual_v2';

-- 6. Seed platform pricing
INSERT INTO public.platform_pricing (llm_model, tts_model, cost_real_per_min, cost_billed_per_min, markup_multiplier, label)
VALUES
  ('gemini-2.5-flash',  'eleven_turbo_v2_5',       0.0200, 0.0400, 2.0, 'Flash + Turbo (Base)'),
  ('gemini-2.5-flash',  'eleven_multilingual_v2',  0.0300, 0.0600, 2.0, 'Flash + Multilingual'),
  ('gpt-4o-mini',       'eleven_turbo_v2_5',       0.0350, 0.0700, 2.0, 'GPT-4o Mini + Turbo'),
  ('gpt-4o-mini',       'eleven_multilingual_v2',  0.0450, 0.0900, 2.0, 'GPT-4o Mini + Multi'),
  ('gpt-4o',            'eleven_turbo_v2_5',       0.0600, 0.1200, 2.0, 'GPT-4o + Turbo (Pro)'),
  ('gpt-4o',            'eleven_multilingual_v2',  0.0700, 0.1400, 2.0, 'GPT-4o + Multi (Pro)'),
  ('claude-sonnet-4-5', 'eleven_multilingual_v2',  0.0800, 0.1600, 2.0, 'Claude Sonnet + Multi'),
  ('claude-haiku-4-5',  'eleven_turbo_v2_5',       0.0400, 0.0800, 2.0, 'Claude Haiku + Turbo')
ON CONFLICT (llm_model, tts_model) DO NOTHING;

-- 7. RLS
ALTER TABLE public.platform_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_usage ENABLE ROW LEVEL SECURITY;

-- Platform pricing: SuperAdmin full, companies read
CREATE POLICY "sa_pricing_all" ON public.platform_pricing
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "co_pricing_select" ON public.platform_pricing
  FOR SELECT TO authenticated
  USING (true);

-- AI Credits: SuperAdmin full, company read own
CREATE POLICY "sa_credits_all" ON public.ai_credits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "co_credits_select" ON public.ai_credits
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- AI Credit Topups: SuperAdmin full, company read own
CREATE POLICY "sa_topups_all" ON public.ai_credit_topups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "co_topups_select" ON public.ai_credit_topups
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- AI Credit Usage: SuperAdmin full, company read own
CREATE POLICY "sa_usage_all" ON public.ai_credit_usage
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "co_usage_select" ON public.ai_credit_usage
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_credits_company ON public.ai_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_credit_topups_company ON public.ai_credit_topups(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_credit_usage_company ON public.ai_credit_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_credit_usage_agent ON public.ai_credit_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_credit_usage_created ON public.ai_credit_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_pricing_combo ON public.platform_pricing(llm_model, tts_model);

-- 9. Trigger: auto-create credits when company is created
CREATE OR REPLACE FUNCTION public.init_company_credits() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.ai_credits (company_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS t_company_credits ON public.companies;
CREATE TRIGGER t_company_credits AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.init_company_credits();

-- 10. View: monthly billing summary
CREATE OR REPLACE VIEW public.monthly_billing_summary AS
SELECT
  u.company_id,
  c.name AS company_name,
  DATE_TRUNC('month', u.created_at) AS month,
  COUNT(*) AS conversations_count,
  SUM(u.duration_min) AS total_minutes,
  SUM(u.cost_real_total) AS total_cost_real_eur,
  SUM(u.cost_billed_total) AS total_cost_billed_eur,
  SUM(u.margin_total) AS total_margin_eur,
  ROUND(AVG(u.cost_billed_per_min)::numeric, 6) AS avg_cost_per_min,
  COUNT(DISTINCT u.agent_id) AS agents_used
FROM public.ai_credit_usage u
JOIN public.companies c ON c.id = u.company_id
GROUP BY u.company_id, c.name, DATE_TRUNC('month', u.created_at);
