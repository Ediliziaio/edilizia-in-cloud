-- ============================================================
-- AI Agents Module — Phase 1 Tables
-- ============================================================

-- 1. ai_agents
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  elevenlabs_agent_id text,
  name text NOT NULL,
  system_prompt text NOT NULL DEFAULT '',
  first_message text NOT NULL DEFAULT '',
  voice_id text,
  llm_model text NOT NULL DEFAULT 'gemini-2.5-flash',
  language text NOT NULL DEFAULT 'it',
  is_interruptible boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
