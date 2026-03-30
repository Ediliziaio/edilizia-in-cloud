-- A/B Testing: branches table
CREATE TABLE IF NOT EXISTS public.ai_agent_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Variante',
  traffic_percent integer NOT NULL DEFAULT 0,
  is_main boolean NOT NULL DEFAULT false,
  system_prompt text,
  first_message text,
  voice_id text,
  llm_model text,
  conversations_count integer NOT NULL DEFAULT 0,
  appointments_count integer NOT NULL DEFAULT 0,
  avg_duration_seconds numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
