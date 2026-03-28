CREATE INDEX idx_fer_flow_started ON public.flow_execution_runs(flow_id, started_at DESC);
