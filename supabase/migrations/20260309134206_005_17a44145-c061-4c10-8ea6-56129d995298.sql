-- 3. Connections
CREATE TABLE IF NOT EXISTS public.internal_automation_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES internal_automation_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES internal_automation_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
