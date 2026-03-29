CREATE TABLE IF NOT EXISTS automation_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  nodes_snapshot JSONB NOT NULL DEFAULT '[]',
  connections_snapshot JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_by_name TEXT,
  version_note TEXT
);
