-- Silvio multi-agent P1 hardening: tool registry, agent memory and review gates.

CREATE TABLE IF NOT EXISTS public.silvio_agent_tool_registry (
  tool_key text PRIMARY KEY,
  display_name text NOT NULL,
  description text NOT NULL,
  tool_kind text NOT NULL DEFAULT 'rpc'
    CHECK (tool_kind IN ('rpc', 'edge_function', 'internal', 'external')),
  rpc_name text,
  default_args jsonb NOT NULL DEFAULT '{}'::jsonb,
  access_mode text NOT NULL DEFAULT 'read'
    CHECK (access_mode IN ('read', 'write_proposal', 'write_requires_approval', 'blocked')),
  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  timeout_ms integer NOT NULL DEFAULT 8000,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_tool_permissions (
  agent_key text NOT NULL REFERENCES public.silvio_agent_registry(agent_key) ON DELETE CASCADE,
  tool_key text NOT NULL REFERENCES public.silvio_agent_tool_registry(tool_key) ON DELETE CASCADE,
  execution_mode text NOT NULL DEFAULT 'read'
    CHECK (execution_mode IN ('read', 'proposal_only', 'approval_required', 'blocked')),
  enabled boolean NOT NULL DEFAULT true,
  max_calls_per_mission integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_key, tool_key)
);

CREATE TABLE IF NOT EXISTS public.silvio_agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL REFERENCES public.silvio_agent_registry(agent_key) ON DELETE CASCADE,
  memory_type text NOT NULL DEFAULT 'pattern'
    CHECK (memory_type IN ('fact', 'preference', 'decision', 'pattern', 'avoid', 'playbook')),
  content text NOT NULL,
  source text,
  source_mission_id uuid REFERENCES public.silvio_agent_missions(id) ON DELETE SET NULL,
  confidence numeric(4,3) DEFAULT 0.700,
  memory_status text NOT NULL DEFAULT 'suggested'
    CHECK (memory_status IN ('suggested', 'active', 'rejected', 'archived')),
  enabled boolean NOT NULL DEFAULT false,
  hits_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_agent_memory_agent_status
  ON public.silvio_agent_memory(agent_key, memory_status, enabled, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_silvio_agent_tool_permissions_agent
  ON public.silvio_agent_tool_permissions(agent_key, enabled);

DROP TRIGGER IF EXISTS trg_silvio_agent_tool_registry_updated_at ON public.silvio_agent_tool_registry;
CREATE TRIGGER trg_silvio_agent_tool_registry_updated_at
  BEFORE UPDATE ON public.silvio_agent_tool_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_agent_memory_updated_at ON public.silvio_agent_memory;
CREATE TRIGGER trg_silvio_agent_memory_updated_at
  BEFORE UPDATE ON public.silvio_agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.silvio_agent_tool_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_tool_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage silvio agent tool registry" ON public.silvio_agent_tool_registry;
CREATE POLICY "Super admins manage silvio agent tool registry"
  ON public.silvio_agent_tool_registry FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent tool permissions" ON public.silvio_agent_tool_permissions;
CREATE POLICY "Super admins manage silvio agent tool permissions"
  ON public.silvio_agent_tool_permissions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio agent memory" ON public.silvio_agent_memory;
CREATE POLICY "Super admins manage silvio agent memory"
  ON public.silvio_agent_memory FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.silvio_agent_tool_registry (
  tool_key,
  display_name,
  description,
  tool_kind,
  rpc_name,
  default_args,
  access_mode,
  risk_level,
  timeout_ms,
  enabled
) VALUES
  ('search_knowledge', 'Knowledge Search', 'Cerca nel know-how operativo di Silvio e restituisce fonti sintetiche.', 'edge_function', null, '{"top_k":5}'::jsonb, 'read', 'low', 10000, true),
  ('get_mrr_breakdown', 'MRR Breakdown', 'MRR, ARR, ARPU, clienti paying/trial/unpaid e nuovo MRR.', 'rpc', 'silvio_get_mrr_breakdown', '{"p_period":"30d"}'::jsonb, 'read', 'medium', 8000, true),
  ('get_unpaid_customers', 'Unpaid Customers', 'Clienti con pagamento fallito o scaduto.', 'rpc', 'silvio_get_unpaid_customers', '{"p_limit":10}'::jsonb, 'read', 'high', 8000, true),
  ('get_revenue_forecast', 'Revenue Forecast', 'Proiezione MRR dei prossimi mesi.', 'rpc', 'silvio_get_revenue_forecast', '{"p_months_ahead":3}'::jsonb, 'read', 'medium', 8000, true),
  ('get_ai_costs_summary', 'AI Costs Summary', 'Costo AI OpenRouter per periodo.', 'rpc', 'silvio_get_ai_costs_summary', '{"p_period":"30d"}'::jsonb, 'read', 'medium', 8000, true),
  ('get_top_customers_by_revenue', 'Top Customers Revenue', 'Top aziende per ricavi.', 'rpc', 'silvio_get_top_customers_by_revenue', '{"p_limit":10}'::jsonb, 'read', 'high', 8000, true),
  ('list_tickets', 'Open Tickets', 'Ticket aperti filtrati per status e priorita.', 'rpc', 'silvio_list_tickets', '{"p_status":"open","p_priority":"all","p_limit":15}'::jsonb, 'read', 'medium', 8000, true),
  ('cluster_tickets', 'Ticket Clustering', 'Cluster di ticket ricorrenti.', 'rpc', 'silvio_cluster_tickets', '{"p_period":"30d","p_min_cluster":3}'::jsonb, 'read', 'medium', 12000, true),
  ('list_leads', 'Hot Leads', 'Lead caldi e opportunita da prioritizzare.', 'rpc', 'silvio_list_leads', '{"p_score_min":60,"p_days_since_contact":0,"p_status":"all","p_limit":20}'::jsonb, 'read', 'medium', 8000, true)
ON CONFLICT (tool_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  tool_kind = EXCLUDED.tool_kind,
  rpc_name = EXCLUDED.rpc_name,
  default_args = EXCLUDED.default_args,
  access_mode = EXCLUDED.access_mode,
  risk_level = EXCLUDED.risk_level,
  timeout_ms = EXCLUDED.timeout_ms,
  enabled = EXCLUDED.enabled,
  updated_at = now();

INSERT INTO public.silvio_agent_tool_permissions (agent_key, tool_key, execution_mode, enabled, max_calls_per_mission) VALUES
  ('planner_agent', 'search_knowledge', 'read', true, 1),
  ('growth_agent', 'search_knowledge', 'read', true, 1),
  ('growth_agent', 'list_leads', 'read', true, 1),
  ('sales_agent', 'list_leads', 'read', true, 1),
  ('sales_agent', 'get_top_customers_by_revenue', 'read', true, 1),
  ('finance_agent', 'get_mrr_breakdown', 'read', true, 1),
  ('finance_agent', 'get_unpaid_customers', 'read', true, 1),
  ('finance_agent', 'get_revenue_forecast', 'read', true, 1),
  ('finance_agent', 'get_ai_costs_summary', 'read', true, 1),
  ('product_tech_agent', 'get_ai_costs_summary', 'read', true, 1),
  ('product_tech_agent', 'search_knowledge', 'read', true, 1),
  ('customer_success_agent', 'list_tickets', 'read', true, 1),
  ('customer_success_agent', 'cluster_tickets', 'read', true, 1),
  ('customer_success_agent', 'get_unpaid_customers', 'read', true, 1),
  ('qa_compliance_agent', 'search_knowledge', 'read', true, 1),
  ('qa_compliance_agent', 'get_ai_costs_summary', 'read', true, 1)
ON CONFLICT (agent_key, tool_key) DO UPDATE SET
  execution_mode = EXCLUDED.execution_mode,
  enabled = EXCLUDED.enabled,
  max_calls_per_mission = EXCLUDED.max_calls_per_mission;

CREATE OR REPLACE FUNCTION public.silvio_agent_resolve_mission(
  p_mission_id uuid,
  p_resolution text,
  p_note text DEFAULT null
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  IF p_resolution NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;

  v_status := CASE WHEN p_resolution = 'approved' THEN 'completed' ELSE 'cancelled' END;

  UPDATE public.silvio_agent_missions
  SET
    status = v_status,
    metadata = metadata || jsonb_build_object(
      'human_resolution', p_resolution,
      'human_resolution_note', p_note,
      'human_resolved_by', v_user,
      'human_resolved_at', now()
    ),
    updated_at = now()
  WHERE id = p_mission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_agent_resolve_mission(uuid, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_silvio_agent_performance
WITH (security_invoker = true) AS
SELECT
  r.agent_key,
  r.display_name,
  r.risk_level,
  r.enabled,
  COUNT(t.id) AS tasks_total,
  COUNT(t.id) FILTER (WHERE t.status = 'completed') AS tasks_completed,
  COUNT(t.id) FILTER (WHERE t.status = 'failed') AS tasks_failed,
  COALESCE(AVG(t.tokens_total) FILTER (WHERE t.tokens_total > 0), 0) AS avg_tokens,
  COALESCE(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))) FILTER (WHERE t.completed_at IS NOT NULL), 0) AS avg_seconds,
  COUNT(DISTINCT m.id) AS missions_touched,
  COUNT(DISTINCT e.id) FILTER (WHERE e.verdict = 'blocked') AS qa_blocked_count,
  COUNT(DISTINCT e.id) FILTER (WHERE e.needs_human_approval) AS approval_required_count
FROM public.silvio_agent_registry r
LEFT JOIN public.silvio_agent_tasks t ON t.agent_key = r.agent_key
LEFT JOIN public.silvio_agent_missions m ON m.id = t.mission_id
LEFT JOIN public.silvio_agent_evaluations e ON e.mission_id = m.id
GROUP BY r.agent_key, r.display_name, r.risk_level, r.enabled;
