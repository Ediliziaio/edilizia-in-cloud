
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

CREATE INDEX idx_fer_flow_id ON public.flow_execution_runs(flow_id);
CREATE INDEX idx_fer_company_id ON public.flow_execution_runs(company_id);
CREATE INDEX idx_fer_started_at ON public.flow_execution_runs(started_at DESC);

ALTER TABLE public.flow_execution_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company execution runs"
  ON public.flow_execution_runs
  FOR SELECT
  TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    UNION
    SELECT mca.company_id FROM public.multi_company_access mca WHERE mca.user_id = auth.uid()
    UNION
    SELECT ai.target_company_id FROM public.active_impersonations ai WHERE ai.admin_user_id = auth.uid() AND ai.expires_at > now()
  ));
