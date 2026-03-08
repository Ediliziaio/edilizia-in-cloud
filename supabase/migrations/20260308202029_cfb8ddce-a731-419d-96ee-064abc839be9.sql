
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

CREATE INDEX idx_internal_ai_agents_company ON public.internal_ai_agents(company_id);

-- 2. internal_outbound_campaigns (created before internal_call_logs because of FK)
CREATE TABLE public.internal_outbound_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id          UUID NOT NULL REFERENCES public.internal_ai_agents(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  campaign_type     TEXT NOT NULL DEFAULT 'custom_outreach',
  status            TEXT NOT NULL DEFAULT 'draft',
  target_type       TEXT NOT NULL DEFAULT 'contact_list',
  contact_ids       UUID[],
  filter_config     JSONB DEFAULT '{}'::jsonb,
  dynamic_vars      JSONB DEFAULT '{}'::jsonb,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  total_calls       INTEGER NOT NULL DEFAULT 0,
  calls_answered    INTEGER NOT NULL DEFAULT 0,
  calls_failed      INTEGER NOT NULL DEFAULT 0,
  calls_per_minute  INTEGER NOT NULL DEFAULT 3,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_outbound_campaigns_company ON public.internal_outbound_campaigns(company_id);

-- 3. internal_call_logs
CREATE TABLE public.internal_call_logs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id                    UUID NOT NULL REFERENCES public.internal_ai_agents(id) ON DELETE CASCADE,
  elevenlabs_conversation_id  TEXT,
  caller_phone                TEXT,
  contact_id                  UUID REFERENCES public.marketing_contacts(id),
  contact_name                TEXT,
  call_direction              TEXT NOT NULL DEFAULT 'inbound',
  campaign_id                 UUID REFERENCES public.internal_outbound_campaigns(id),
  duration_seconds            INTEGER NOT NULL DEFAULT 0,
  messages_count              INTEGER NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'completed',
  outcome                     TEXT DEFAULT 'resolved',
  summary                     TEXT,
  transcript                  JSONB,
  metadata                    JSONB,
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_call_logs_company ON public.internal_call_logs(company_id);
CREATE INDEX idx_internal_call_logs_agent ON public.internal_call_logs(agent_id);
CREATE INDEX idx_internal_call_logs_contact ON public.internal_call_logs(contact_id);

-- 4. internal_agent_actions
CREATE TABLE public.internal_agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       UUID NOT NULL REFERENCES public.internal_call_logs(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tool_name     TEXT NOT NULL,
  action_type   TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  input_params  JSONB DEFAULT '{}'::jsonb,
  result        JSONB DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_agent_actions_call ON public.internal_agent_actions(call_id);
CREATE INDEX idx_internal_agent_actions_company ON public.internal_agent_actions(company_id);

-- 5. ALTER ai_agent_phone_numbers for Smart Routing
ALTER TABLE public.ai_agent_phone_numbers
  ADD COLUMN IF NOT EXISTS routing_mode TEXT NOT NULL DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS internal_agent_id UUID REFERENCES public.internal_ai_agents(id);

-- 6. RLS Policies

-- internal_ai_agents
ALTER TABLE public.internal_ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "int_agents_tenant_select" ON public.internal_ai_agents
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_agents_tenant_insert" ON public.internal_ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_agents_tenant_update" ON public.internal_ai_agents
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_agents_tenant_delete" ON public.internal_ai_agents
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- internal_call_logs
ALTER TABLE public.internal_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "int_calls_tenant_select" ON public.internal_call_logs
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_calls_tenant_insert" ON public.internal_call_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- internal_agent_actions
ALTER TABLE public.internal_agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "int_actions_tenant_select" ON public.internal_agent_actions
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_actions_tenant_insert" ON public.internal_agent_actions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- internal_outbound_campaigns
ALTER TABLE public.internal_outbound_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "int_campaigns_tenant_select" ON public.internal_outbound_campaigns
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_campaigns_tenant_insert" ON public.internal_outbound_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_campaigns_tenant_update" ON public.internal_outbound_campaigns
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "int_campaigns_tenant_delete" ON public.internal_outbound_campaigns
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));
