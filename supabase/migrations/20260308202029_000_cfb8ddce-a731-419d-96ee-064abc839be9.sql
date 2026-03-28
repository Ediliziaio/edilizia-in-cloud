-- =============================================
-- Internal AI Agents Module — Phase 1 Schema
-- =============================================

-- 1. internal_ai_agents
CREATE TABLE public.internal_ai_agents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  elevenlabs_agent_id TEXT,
  name                TEXT NOT NULL,
  agent_type          TEXT NOT NULL DEFAULT 'customer_service',
  system_prompt       TEXT NOT NULL DEFAULT '',
  first_message       TEXT NOT NULL DEFAULT '',
  voice_id            TEXT NOT NULL DEFAULT '',
  llm_model           TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  language            TEXT NOT NULL DEFAULT 'it',
  is_interruptible    BOOLEAN NOT NULL DEFAULT true,
  status              TEXT NOT NULL DEFAULT 'draft',
  enabled_tools       TEXT[] NOT NULL DEFAULT '{}',
  tools_config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_duration        INTEGER DEFAULT 900,
  silence_timeout     INTEGER DEFAULT 30,
  error_message       TEXT DEFAULT 'Mi dispiace, si è verificato un problema.',
  phone_number_id     UUID REFERENCES public.ai_agent_phone_numbers(id),
  created_by          UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
