-- 6. Execution log
CREATE TABLE IF NOT EXISTS public.internal_automation_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES internal_automation_enrollments(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  node_id UUID REFERENCES internal_automation_nodes(id) ON DELETE SET NULL,
  node_type TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','skipped')),
  input_json JSONB,
  output_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
