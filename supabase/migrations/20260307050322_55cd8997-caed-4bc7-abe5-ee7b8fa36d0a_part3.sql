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
