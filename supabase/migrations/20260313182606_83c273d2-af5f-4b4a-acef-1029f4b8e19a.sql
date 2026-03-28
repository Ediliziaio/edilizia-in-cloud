-- OPT-1: Replace simple index with composite index for useFlowExecutions query
DROP INDEX IF EXISTS idx_fer_flow_id;
