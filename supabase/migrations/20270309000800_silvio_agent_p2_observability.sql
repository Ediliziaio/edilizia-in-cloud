-- P2 observability layer for Silvio multi-agent operations.
-- Adds read-only health views for superadmin dashboards and operational QA.

CREATE OR REPLACE VIEW public.v_silvio_agent_mission_health
WITH (security_invoker = true) AS
SELECT
  now() AS computed_at,
  COUNT(*) FILTER (WHERE status IN ('planning', 'running')) AS active_missions,
  COUNT(*) FILTER (WHERE status = 'waiting_approval') AS waiting_approval_missions,
  COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= now() - interval '7 days') AS failed_missions_7d,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS missions_7d,
  COALESCE(
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))
      FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL AND created_at >= now() - interval '7 days'),
    0
  )::numeric(12,2) AS avg_completed_seconds_7d,
  COALESCE(SUM(total_cost_usd) FILTER (WHERE created_at >= now() - interval '7 days'), 0)::numeric(12,6) AS total_cost_usd_7d,
  COALESCE(SUM(total_tokens) FILTER (WHERE created_at >= now() - interval '7 days'), 0)::bigint AS total_tokens_7d
FROM public.silvio_agent_missions;

CREATE OR REPLACE VIEW public.v_silvio_agent_tool_health
WITH (security_invoker = true) AS
SELECT
  tool_name,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS total_calls_7d,
  COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= now() - interval '7 days') AS failed_calls_7d,
  COUNT(*) FILTER (WHERE status = 'blocked' AND created_at >= now() - interval '7 days') AS blocked_calls_7d,
  COALESCE(
    AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL AND created_at >= now() - interval '7 days'),
    0
  )::numeric(12,2) AS avg_duration_ms,
  COALESCE(
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
      FILTER (WHERE duration_ms IS NOT NULL AND created_at >= now() - interval '7 days'),
    0
  )::numeric(12,2) AS p95_duration_ms,
  MAX(created_at) AS last_called_at,
  (ARRAY_AGG(error_message ORDER BY created_at DESC) FILTER (WHERE error_message IS NOT NULL))[1] AS last_error_message
FROM public.silvio_agent_tool_calls
GROUP BY tool_name;
