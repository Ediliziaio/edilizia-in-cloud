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
