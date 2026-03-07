
-- ============================================================
-- AI Agents Module — Phase 1 Tables
-- ============================================================

-- 1. ai_agents
CREATE TABLE public.ai_agents (
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

CREATE INDEX idx_ai_agents_company ON public.ai_agents(company_id);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agents_tenant_select" ON public.ai_agents
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_agents_tenant_insert" ON public.ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "ai_agents_tenant_update" ON public.ai_agents
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_agents_tenant_delete" ON public.ai_agents
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_agents_super_admin" ON public.ai_agents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 2. ai_agent_knowledge_docs
CREATE TABLE public.ai_agent_knowledge_docs (
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

CREATE INDEX idx_ai_agent_kb_company ON public.ai_agent_knowledge_docs(company_id);

ALTER TABLE public.ai_agent_knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_kb_tenant_select" ON public.ai_agent_knowledge_docs
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_kb_tenant_insert" ON public.ai_agent_knowledge_docs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "ai_kb_tenant_update" ON public.ai_agent_knowledge_docs
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_kb_tenant_delete" ON public.ai_agent_knowledge_docs
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_kb_super_admin" ON public.ai_agent_knowledge_docs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 3. ai_agent_conversations
CREATE TABLE public.ai_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  elevenlabs_conversation_id text,
  duration_seconds integer NOT NULL DEFAULT 0,
  messages_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  started_at timestamptz NOT NULL DEFAULT now(),
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  appointment_created boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_ai_agent_convos_company ON public.ai_agent_conversations(company_id);

ALTER TABLE public.ai_agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_convos_tenant_select" ON public.ai_agent_conversations
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_convos_tenant_insert" ON public.ai_agent_conversations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "ai_convos_super_admin" ON public.ai_agent_conversations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 4. ai_agent_credits
CREATE TABLE public.ai_agent_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  total_minutes_purchased numeric NOT NULL DEFAULT 0,
  minutes_used numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_agent_credits_company ON public.ai_agent_credits(company_id);

ALTER TABLE public.ai_agent_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_credits_tenant_select" ON public.ai_agent_credits
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_credits_super_admin" ON public.ai_agent_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 5. platform_elevenlabs_config (platform-level, super_admin only)
CREATE TABLE public.platform_elevenlabs_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_encrypted text,
  default_llm text NOT NULL DEFAULT 'gemini-2.5-flash',
  markup_multiplier numeric NOT NULL DEFAULT 2.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_elevenlabs_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_el_config_super_admin" ON public.platform_elevenlabs_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 6. ai_agent_audit_log
CREATE TABLE public.ai_agent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid,
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_audit_company ON public.ai_agent_audit_log(company_id);

ALTER TABLE public.ai_agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_audit_tenant_select" ON public.ai_agent_audit_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "ai_audit_super_admin" ON public.ai_agent_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
