-- P0/P1 hardening for Silvio multi-agent operations.
-- Scope: async mission UX, monitor idempotency, objective metrics and reliable agent analytics.

ALTER TABLE public.silvio_agent_missions
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;

UPDATE public.silvio_strategic_objectives
SET target_metric = 'hot_leads_returned',
    updated_at = now()
WHERE objective_key = 'lead_conversion'
  AND target_metric = 'hot_leads';

WITH ranked_active_events AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY rule_key ORDER BY created_at DESC, id DESC) AS rn
  FROM public.silvio_monitor_events
  WHERE status IN ('open', 'acknowledged')
)
UPDATE public.silvio_monitor_events e
SET
  status = 'dismissed',
  resolved_at = COALESCE(e.resolved_at, now()),
  snapshot = e.snapshot || jsonb_build_object('auto_dismissed_reason', 'duplicate_active_rule_event')
FROM ranked_active_events r
WHERE e.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_silvio_monitor_events_active_rule
  ON public.silvio_monitor_events(rule_key)
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_silvio_monitor_events_rule_status
  ON public.silvio_monitor_events(rule_key, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.silvio_agent_resolve_mission(
  p_mission_id uuid,
  p_resolution text,
  p_note text DEFAULT null
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  IF p_resolution NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;

  v_status := CASE WHEN p_resolution = 'approved' THEN 'completed' ELSE 'cancelled' END;

  UPDATE public.silvio_agent_missions
  SET
    status = v_status,
    completed_at = now(),
    metadata = metadata || jsonb_build_object(
      'human_resolution', p_resolution,
      'human_resolution_note', p_note,
      'human_resolved_by', v_user,
      'human_resolved_at', now()
    ),
    updated_at = now()
  WHERE id = p_mission_id
    AND status = 'waiting_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found or not waiting for approval';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_agent_resolve_mission(uuid, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_silvio_agent_performance
WITH (security_invoker = true) AS
WITH task_stats AS (
  SELECT
    agent_key,
    COUNT(*) AS tasks_total,
    COUNT(*) FILTER (WHERE status = 'completed') AS tasks_completed,
    COUNT(*) FILTER (WHERE status = 'failed') AS tasks_failed,
    COALESCE(AVG(tokens_total) FILTER (WHERE tokens_total > 0), 0) AS avg_tokens,
    COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL), 0) AS avg_seconds,
    COUNT(DISTINCT mission_id) AS missions_touched
  FROM public.silvio_agent_tasks
  GROUP BY agent_key
),
qa_stats AS (
  SELECT
    t.agent_key,
    COUNT(DISTINCT e.id) FILTER (WHERE e.verdict = 'blocked') AS qa_blocked_count,
    COUNT(DISTINCT e.id) FILTER (WHERE e.needs_human_approval) AS approval_required_count
  FROM public.silvio_agent_tasks t
  JOIN public.silvio_agent_evaluations e ON e.mission_id = t.mission_id
  GROUP BY t.agent_key
)
SELECT
  r.agent_key,
  r.display_name,
  r.risk_level,
  r.enabled,
  COALESCE(t.tasks_total, 0) AS tasks_total,
  COALESCE(t.tasks_completed, 0) AS tasks_completed,
  COALESCE(t.tasks_failed, 0) AS tasks_failed,
  COALESCE(t.avg_tokens, 0) AS avg_tokens,
  COALESCE(t.avg_seconds, 0) AS avg_seconds,
  COALESCE(t.missions_touched, 0) AS missions_touched,
  COALESCE(q.qa_blocked_count, 0) AS qa_blocked_count,
  COALESCE(q.approval_required_count, 0) AS approval_required_count
FROM public.silvio_agent_registry r
LEFT JOIN task_stats t ON t.agent_key = r.agent_key
LEFT JOIN qa_stats q ON q.agent_key = r.agent_key;

CREATE OR REPLACE VIEW public.v_silvio_agent_mission_summary
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.title,
  m.objective,
  m.status,
  m.priority,
  m.mode,
  m.selected_agents,
  m.summary_md,
  m.next_action,
  m.confidence,
  m.total_cost_usd,
  m.total_tokens,
  m.started_at,
  m.completed_at,
  m.last_error,
  m.created_by,
  m.created_at,
  m.updated_at,
  COUNT(DISTINCT t.id) AS tasks_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') AS completed_tasks_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'failed') AS failed_tasks_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.entry_type = 'risk') AS risks_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.visibility = 'actionable') AS actionable_count,
  m.review_requested_at
FROM public.silvio_agent_missions m
LEFT JOIN public.silvio_agent_tasks t ON t.mission_id = m.id
LEFT JOIN public.silvio_agent_blackboard b ON b.mission_id = m.id
GROUP BY m.id;
