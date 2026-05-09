-- Silvio Superadmin multi-agent operating system.
-- Scope: superadmin only, no tenant/customer data exposure through RLS.

CREATE TABLE IF NOT EXISTS public.silvio_agent_registry (
  agent_key text PRIMARY KEY,
  display_name text NOT NULL,
  mission text NOT NULL,
  operating_mode text NOT NULL DEFAULT 'analysis'
    CHECK (operating_mode IN ('coordination', 'planning', 'analysis', 'execution', 'verification')),
  persona_keys text[] NOT NULL DEFAULT '{}',
  allowed_tools text[] NOT NULL DEFAULT '{}',
  model_tier_key text NOT NULL DEFAULT 't3_balanced',
  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  max_cost_usd numeric(10,4) NOT NULL DEFAULT 0.2500,
  max_runtime_seconds integer NOT NULL DEFAULT 90,
  output_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'planning', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  mode text NOT NULL DEFAULT 'panel'
    CHECK (mode IN ('solo', 'panel', 'debate', 'chain', 'supervised_execution')),
  selected_agents text[] NOT NULL DEFAULT '{}',
  summary_md text,
  next_action text,
  confidence numeric(4,3),
  total_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.silvio_agent_missions(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.silvio_agent_registry(agent_key) ON DELETE RESTRICT,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
  input_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_md text,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  tokens_total integer NOT NULL DEFAULT 0,
  model_id text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_blackboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.silvio_agent_missions(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.silvio_agent_tasks(id) ON DELETE CASCADE,
  agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  entry_type text NOT NULL
    CHECK (entry_type IN ('fact', 'insight', 'risk', 'opportunity', 'recommendation', 'decision', 'question', 'source')),
  title text NOT NULL,
  content text NOT NULL,
  confidence numeric(4,3),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'summary', 'actionable')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.silvio_agent_missions(id) ON DELETE CASCADE,
  sender_agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  receiver_agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('coordinator', 'agent', 'verifier', 'system')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.silvio_agent_missions(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.silvio_agent_tasks(id) ON DELETE CASCADE,
  agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  artifact_type text NOT NULL DEFAULT 'analysis'
    CHECK (artifact_type IN ('report', 'plan', 'draft', 'analysis', 'checklist', 'json')),
  title text NOT NULL,
  content_md text,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.silvio_agent_missions(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.silvio_agent_tasks(id) ON DELETE CASCADE,
  agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'success', 'failed', 'blocked')),
  duration_ms integer,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.silvio_agent_missions(id) ON DELETE CASCADE,
  evaluator_agent_key text NOT NULL DEFAULT 'qa_compliance_agent'
    REFERENCES public.silvio_agent_registry(agent_key) ON DELETE RESTRICT,
  quality_score numeric(4,3),
  risk_score numeric(4,3),
  hallucination_risk text NOT NULL DEFAULT 'medium'
    CHECK (hallucination_risk IN ('low', 'medium', 'high')),
  missing_evidence boolean NOT NULL DEFAULT false,
  needs_human_approval boolean NOT NULL DEFAULT false,
  verdict text NOT NULL DEFAULT 'needs_revision'
    CHECK (verdict IN ('pass', 'needs_revision', 'blocked')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_agent_missions_status_created
  ON public.silvio_agent_missions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_silvio_agent_missions_created_by
  ON public.silvio_agent_missions(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_silvio_agent_tasks_mission_status
  ON public.silvio_agent_tasks(mission_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_silvio_agent_blackboard_mission_type
  ON public.silvio_agent_blackboard(mission_id, entry_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_silvio_agent_messages_mission_created
  ON public.silvio_agent_messages(mission_id, created_at);

DROP TRIGGER IF EXISTS trg_silvio_agent_registry_updated_at ON public.silvio_agent_registry;
CREATE TRIGGER trg_silvio_agent_registry_updated_at
  BEFORE UPDATE ON public.silvio_agent_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_agent_missions_updated_at ON public.silvio_agent_missions;
CREATE TRIGGER trg_silvio_agent_missions_updated_at
  BEFORE UPDATE ON public.silvio_agent_missions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_agent_tasks_updated_at ON public.silvio_agent_tasks;
CREATE TRIGGER trg_silvio_agent_tasks_updated_at
  BEFORE UPDATE ON public.silvio_agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.silvio_agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_blackboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage silvio agent registry" ON public.silvio_agent_registry;
CREATE POLICY "Super admins manage silvio agent registry"
  ON public.silvio_agent_registry FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent missions" ON public.silvio_agent_missions;
CREATE POLICY "Super admins manage silvio agent missions"
  ON public.silvio_agent_missions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent tasks" ON public.silvio_agent_tasks;
CREATE POLICY "Super admins manage silvio agent tasks"
  ON public.silvio_agent_tasks FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent blackboard" ON public.silvio_agent_blackboard;
CREATE POLICY "Super admins manage silvio agent blackboard"
  ON public.silvio_agent_blackboard FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent messages" ON public.silvio_agent_messages;
CREATE POLICY "Super admins manage silvio agent messages"
  ON public.silvio_agent_messages FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent artifacts" ON public.silvio_agent_artifacts;
CREATE POLICY "Super admins manage silvio agent artifacts"
  ON public.silvio_agent_artifacts FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent tool calls" ON public.silvio_agent_tool_calls;
CREATE POLICY "Super admins manage silvio agent tool calls"
  ON public.silvio_agent_tool_calls FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent evaluations" ON public.silvio_agent_evaluations;
CREATE POLICY "Super admins manage silvio agent evaluations"
  ON public.silvio_agent_evaluations FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.silvio_agent_registry (
  agent_key,
  display_name,
  mission,
  operating_mode,
  persona_keys,
  allowed_tools,
  model_tier_key,
  risk_level,
  max_cost_usd,
  max_runtime_seconds,
  output_contract,
  enabled,
  sort_order
) VALUES
  (
    'silvio_coordinator',
    'Silvio Coordinator',
    'Scompone obiettivi complessi, assegna lavoro agli agenti e produce una sintesi unica per Florin.',
    'coordination',
    ARRAY['vittorio','beatrice','marco','federico'],
    ARRAY['agent_registry','blackboard','mission_synthesis'],
    't3_balanced',
    'medium',
    0.3500,
    120,
    '{"requires_next_action":true,"language":"it","voice":"silvio"}'::jsonb,
    true,
    10
  ),
  (
    'planner_agent',
    'Strategic Planner Agent',
    'Trasforma un obiettivo in piano operativo, milestone, dipendenze, priorita e sequenza di esecuzione.',
    'planning',
    ARRAY['chiara','luca','vittorio'],
    ARRAY['blackboard','plan_builder'],
    't3_balanced',
    'low',
    0.2200,
    90,
    '{"outputs":["plan","dependencies","next_action"]}'::jsonb,
    true,
    20
  ),
  (
    'growth_agent',
    'Growth Agent',
    'Analizza SEO, ads, funnel, contenuti e conversione per generare azioni di crescita misurabili.',
    'analysis',
    ARRAY['sofia','tommaso','gabriele','federico'],
    ARRAY['blackboard','campaign_analysis','seo_review'],
    't3_balanced',
    'medium',
    0.2500,
    90,
    '{"outputs":["growth_levers","experiments","expected_impact"]}'::jsonb,
    true,
    30
  ),
  (
    'sales_agent',
    'Sales Agent',
    'Ottimizza pipeline, CRM, follow-up, demo, offerte e priorita commerciali.',
    'analysis',
    ARRAY['marco','elena','valentina'],
    ARRAY['blackboard','crm_review','sales_playbook'],
    't3_balanced',
    'medium',
    0.2500,
    90,
    '{"outputs":["pipeline_actions","objections","followups"]}'::jsonb,
    true,
    40
  ),
  (
    'finance_agent',
    'Finance Agent',
    'Valuta MRR, costi, marginalita, cashflow, pricing e sostenibilita economica.',
    'analysis',
    ARRAY['beatrice','roberta','laura'],
    ARRAY['blackboard','financial_review','unit_economics'],
    't3_balanced',
    'high',
    0.2500,
    90,
    '{"outputs":["financial_risks","roi","budget_actions"]}'::jsonb,
    true,
    50
  ),
  (
    'product_tech_agent',
    'Product Tech Agent',
    'Analizza UX, prodotto, architettura, performance, bug, technical debt e affidabilita.',
    'analysis',
    ARRAY['luca','matteo','davide','chiara'],
    ARRAY['blackboard','technical_review','ux_review'],
    't3_balanced',
    'high',
    0.2800,
    120,
    '{"outputs":["risks","fixes","implementation_notes"]}'::jsonb,
    true,
    60
  ),
  (
    'customer_success_agent',
    'Customer Success Agent',
    'Riduce churn, migliora onboarding, ticket, retention, adozione e salute dei clienti.',
    'analysis',
    ARRAY['elena','giorgio','antonio'],
    ARRAY['blackboard','support_review','retention_playbook'],
    't3_balanced',
    'medium',
    0.2200,
    90,
    '{"outputs":["customer_risks","retention_actions","support_gaps"]}'::jsonb,
    true,
    70
  ),
  (
    'qa_compliance_agent',
    'QA Compliance Agent',
    'Verifica qualita, sicurezza, GDPR/AI Act, fonti, rischi di allucinazione e necessita di approvazione umana.',
    'verification',
    ARRAY['eleonora','ferrari','davide','roberta'],
    ARRAY['blackboard','risk_gate','compliance_review'],
    't3_balanced',
    'critical',
    0.3000,
    120,
    '{"outputs":["verdict","risk_score","approval_gate","evidence_gaps"]}'::jsonb,
    true,
    80
  )
ON CONFLICT (agent_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  mission = EXCLUDED.mission,
  operating_mode = EXCLUDED.operating_mode,
  persona_keys = EXCLUDED.persona_keys,
  allowed_tools = EXCLUDED.allowed_tools,
  model_tier_key = EXCLUDED.model_tier_key,
  risk_level = EXCLUDED.risk_level,
  max_cost_usd = EXCLUDED.max_cost_usd,
  max_runtime_seconds = EXCLUDED.max_runtime_seconds,
  output_contract = EXCLUDED.output_contract,
  enabled = EXCLUDED.enabled,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE OR REPLACE VIEW public.v_silvio_agent_mission_summary
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.title,
  m.objective,
  m.status,
  m.priority,
  m.mode,
  m.selected_agents,
  m.summary_md,
  m.next_action,
  m.confidence,
  m.total_cost_usd,
  m.total_tokens,
  m.started_at,
  m.completed_at,
  m.last_error,
  m.created_by,
  m.created_at,
  m.updated_at,
  COUNT(DISTINCT t.id) AS tasks_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') AS completed_tasks_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'failed') AS failed_tasks_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.entry_type = 'risk') AS risks_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.visibility = 'actionable') AS actionable_count
FROM public.silvio_agent_missions m
LEFT JOIN public.silvio_agent_tasks t ON t.mission_id = m.id
LEFT JOIN public.silvio_agent_blackboard b ON b.mission_id = m.id
GROUP BY m.id;
