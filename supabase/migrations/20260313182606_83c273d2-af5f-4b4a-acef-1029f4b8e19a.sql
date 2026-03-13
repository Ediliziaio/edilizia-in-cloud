-- OPT-1: Replace simple index with composite index for useFlowExecutions query
DROP INDEX IF EXISTS idx_fer_flow_id;
CREATE INDEX idx_fer_flow_started ON public.flow_execution_runs(flow_id, started_at DESC);