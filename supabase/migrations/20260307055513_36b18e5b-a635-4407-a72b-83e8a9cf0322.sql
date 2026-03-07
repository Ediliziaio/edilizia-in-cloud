
-- Block B: Add security/advanced columns to ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS domain_whitelist text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS require_auth boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_limit_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS conversation_timeout integer DEFAULT 300,
  ADD COLUMN IF NOT EXISTS max_duration integer DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS error_message text DEFAULT 'Mi scusi, si è verificato un errore. Riproviamo.',
  ADD COLUMN IF NOT EXISTS auto_end_on_silence boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS silence_timeout integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tools_config jsonb DEFAULT '{}';

-- Block C: Table for agent tests
CREATE TABLE IF NOT EXISTS public.ai_agent_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  scenario text DEFAULT '',
  expected_outcome text DEFAULT '',
  status text DEFAULT 'pending',
  result_summary text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_agent_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company tests"
  ON public.ai_agent_tests
  FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_ai_agent_tests_agent ON public.ai_agent_tests(agent_id);
