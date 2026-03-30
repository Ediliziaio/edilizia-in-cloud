-- 2. ai_agent_knowledge_docs
CREATE TABLE IF NOT EXISTS public.ai_agent_knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  elevenlabs_doc_id text,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  source_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
