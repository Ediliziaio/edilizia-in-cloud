-- ════════════════════════════════════════════════════════════════════════════
-- MP-09 — Cross-area orchestration: Council of Experts log + cost guard
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_council_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Query input
  query_preview text,                  -- primi 500 char della query (per debug)
  current_persona text,                -- persona da cui parte (es. silvio)

  -- Classifier output (queryClassifier)
  is_multi_area boolean NOT NULL,
  primary_area text,
  involved_areas text[],
  involved_personas text[],
  estimated_complexity text CHECK (estimated_complexity IS NULL OR estimated_complexity IN ('simple', 'medium', 'complex')),

  -- Execution
  decomposition jsonb,                  -- [{ area, persona_key, sub_query, why }]
  sub_outputs jsonb,                    -- output di ogni persona (con response, sources, confidence)
  synthesis_text text,                  -- testo della sintesi finale (se synthesis_required)
  synthesis_used boolean DEFAULT false,

  -- Stats
  total_personas_invoked int NOT NULL DEFAULT 0,
  total_tokens int NOT NULL DEFAULT 0,
  total_cost_eur numeric NOT NULL DEFAULT 0,
  duration_ms int,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_council_company_date
  ON public.ai_council_usage_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_council_user_date
  ON public.ai_council_usage_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.ai_council_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS council_log_company_admin ON public.ai_council_usage_log;
CREATE POLICY council_log_company_admin ON public.ai_council_usage_log
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.has_role(auth.uid(), 'company_admin')
  );

GRANT SELECT ON public.ai_council_usage_log TO authenticated;
GRANT INSERT ON public.ai_council_usage_log TO service_role;

-- View: KPI cost guard giornaliero per company
CREATE OR REPLACE VIEW public.v_council_daily_cost AS
SELECT
  date_trunc('day', created_at)::date AS day,
  company_id,
  count(*) AS total_calls,
  count(*) FILTER (WHERE is_multi_area) AS multi_area_calls,
  count(*) FILTER (WHERE estimated_complexity = 'complex') AS complex_calls,
  ROUND(sum(total_cost_eur)::numeric, 4) AS total_cost_eur,
  ROUND(avg(duration_ms), 0) AS avg_duration_ms,
  ROUND(avg(total_personas_invoked), 1) AS avg_personas_per_call
FROM public.ai_council_usage_log
WHERE created_at >= now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 1 DESC;

GRANT SELECT ON public.v_council_daily_cost TO authenticated;

COMMENT ON TABLE public.ai_council_usage_log IS
  'MP-09: log di ogni invocazione del Council orchestrator (cross-area query). Cost guard: alert se > 50 calls/giorno per company.';
