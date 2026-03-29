CREATE TABLE public.flow_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.automation_enrollments(id) ON DELETE SET NULL,
  trigger_type TEXT,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  steps_log JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  nodes_executed INT DEFAULT 0,
  duration_ms INT
);
