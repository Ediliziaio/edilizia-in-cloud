
-- A/B Testing: branches table
CREATE TABLE public.ai_agent_branches (
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

-- Index for tenant isolation
CREATE INDEX idx_ai_agent_branches_company ON public.ai_agent_branches(company_id);
CREATE INDEX idx_ai_agent_branches_agent ON public.ai_agent_branches(agent_id);

-- Add branch_id to conversations
ALTER TABLE public.ai_agent_conversations
  ADD COLUMN branch_id uuid REFERENCES public.ai_agent_branches(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.ai_agent_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view own branches"
  ON public.ai_agent_branches FOR SELECT
  TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company members can insert own branches"
  ON public.ai_agent_branches FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company members can update own branches"
  ON public.ai_agent_branches FOR UPDATE
  TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company members can delete own branches"
  ON public.ai_agent_branches FOR DELETE
  TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
