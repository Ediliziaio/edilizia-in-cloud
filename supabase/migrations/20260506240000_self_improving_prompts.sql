-- IMPROVEMENT #21 — Self-improving prompts (MP-META hooks)
-- ════════════════════════════════════════════════════════════════════════════
-- Aggrega rejection feedback da action_proposals_audit_log per costruire
-- un dataset "cosa l'AI sbaglia spesso" da usare per fine-tuning prompt.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_prompt_feedback_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  persona_key text NOT NULL,
  tool_name text,

  -- Pattern di rejection
  rejection_category text,
  rejection_count int DEFAULT 0,
  approval_count int DEFAULT 0,
  edit_count int DEFAULT 0,
  undo_count int DEFAULT 0,

  -- Esempio rappresentativo (più recente)
  example_payload jsonb,
  example_user_feedback text,

  period_start date NOT NULL,
  period_end date NOT NULL,

  computed_at timestamptz DEFAULT now(),
  CONSTRAINT uq_feedback_aggregates UNIQUE (company_id, persona_key, tool_name, rejection_category, period_start)
);

CREATE INDEX IF NOT EXISTS idx_feedback_aggr_company ON public.ai_prompt_feedback_aggregates(company_id, computed_at DESC);

ALTER TABLE public.ai_prompt_feedback_aggregates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_aggr_company ON public.ai_prompt_feedback_aggregates;
CREATE POLICY feedback_aggr_company ON public.ai_prompt_feedback_aggregates
  FOR SELECT USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: aggrega feedback degli ultimi N giorni in ai_prompt_feedback_aggregates
-- (chiamato da cron weekly)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_compute_prompt_feedback(
  p_company_id uuid,
  p_days_back int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start date := (current_date - make_interval(days => p_days_back))::date;
  v_end date := current_date;
  v_inserted int := 0;
BEGIN
  -- Aggrega: per persona × tool × rejection_category nel periodo
  WITH events AS (
    SELECT
      ap.persona_key,
      ap.action_type AS tool_name,
      ap.rejection_reason_category AS rejection_category,
      a.event_type
    FROM public.action_proposals_audit_log a
    JOIN public.ai_action_proposals ap ON ap.id = a.proposal_id
    WHERE a.company_id = p_company_id
      AND a.created_at::date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT
      persona_key,
      tool_name,
      rejection_category,
      count(*) FILTER (WHERE event_type = 'rejected') AS rejection_count,
      count(*) FILTER (WHERE event_type = 'approved' OR event_type = 'executed') AS approval_count,
      count(*) FILTER (WHERE event_type = 'edited') AS edit_count,
      count(*) FILTER (WHERE event_type = 'undone') AS undo_count
    FROM events
    GROUP BY persona_key, tool_name, rejection_category
  )
  INSERT INTO public.ai_prompt_feedback_aggregates(
    company_id, persona_key, tool_name, rejection_category,
    rejection_count, approval_count, edit_count, undo_count,
    period_start, period_end
  )
  SELECT
    p_company_id, persona_key, tool_name, rejection_category,
    rejection_count, approval_count, edit_count, undo_count,
    v_start, v_end
  FROM agg
  WHERE persona_key IS NOT NULL
  ON CONFLICT (company_id, persona_key, tool_name, rejection_category, period_start)
  DO UPDATE SET
    rejection_count = EXCLUDED.rejection_count,
    approval_count = EXCLUDED.approval_count,
    edit_count = EXCLUDED.edit_count,
    undo_count = EXCLUDED.undo_count,
    computed_at = now();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'rows_aggregated', v_inserted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_compute_prompt_feedback(uuid, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: query "top problemi AI" per dashboard
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_top_ai_issues(
  p_company_id uuid,
  p_top_n int DEFAULT 10
)
RETURNS TABLE (
  persona_key text,
  tool_name text,
  rejection_category text,
  rejection_count bigint,
  total_count bigint,
  rejection_rate_pct numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.persona_key,
    a.tool_name,
    a.rejection_category,
    SUM(a.rejection_count)::bigint AS rejection_count,
    (SUM(a.rejection_count) + SUM(a.approval_count))::bigint AS total_count,
    ROUND(
      SUM(a.rejection_count)::numeric * 100.0 /
      NULLIF(SUM(a.rejection_count) + SUM(a.approval_count), 0),
      1
    ) AS rejection_rate_pct
  FROM public.ai_prompt_feedback_aggregates a
  WHERE a.company_id = p_company_id
    AND a.computed_at > (now() - interval '30 days')
  GROUP BY a.persona_key, a.tool_name, a.rejection_category
  HAVING SUM(a.rejection_count) > 0
  ORDER BY rejection_rate_pct DESC NULLS LAST, rejection_count DESC
  LIMIT p_top_n;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_top_ai_issues(uuid, int) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Self-improving prompts: tabella + 2 RPC pronti'; END $$;
