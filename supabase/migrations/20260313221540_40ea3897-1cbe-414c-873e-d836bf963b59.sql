
ALTER TABLE automation_flows
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS note_color TEXT,
  ADD COLUMN IF NOT EXISTS allow_reentry BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_multiple_opportunities BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS stop_on_reply BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS time_window_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS time_window_from TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS time_window_to TEXT DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_email TEXT;

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

ALTER TABLE automation_flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company versions"
  ON automation_flow_versions FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Users can insert own company versions"
  ON automation_flow_versions FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
