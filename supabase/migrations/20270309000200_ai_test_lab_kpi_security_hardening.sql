-- ════════════════════════════════════════════════════════════════════════════
-- AI TEST LAB — Hardening sicurezza RPC ai_test_lab_kpi
-- ════════════════════════════════════════════════════════════════════════════
-- Fix difensivo: la RPC ai_test_lab_kpi è SECURITY DEFINER (bypass RLS) e
-- accetta `p_company_id uuid` come parametro. Anche se in pratica `ai_test_runs`
-- contiene SOLO righe della demo company (perché aiRouter.ts scrive solo se
-- demo), aggiungiamo defense-in-depth:
--
--   1. La RPC verifica che p_company_id == DEMO_COMPANY_ID
--   2. Se chiamata con altro company_id → ritorna 0 righe
--   3. Verifica che il caller (auth.uid()) sia membro della company demo
--      (via profiles)
--
-- Idempotente — drop+recreate.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ai_test_lab_kpi(
  p_company_id uuid,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to   timestamptz DEFAULT now()
) RETURNS TABLE (
  feature text,
  model_id text,
  provider text,
  total_calls bigint,
  avg_cost_usd numeric,
  total_cost_usd numeric,
  avg_latency_ms numeric,
  p50_latency_ms numeric,
  p95_latency_ms numeric,
  avg_input_tokens numeric,
  avg_output_tokens numeric,
  avg_rating numeric,
  ratings_count bigint,
  errors_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo_company_id uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid;
  v_caller_company_id uuid;
BEGIN
  -- Defense 1: solo Demo Azienda è valida
  IF p_company_id IS DISTINCT FROM v_demo_company_id THEN
    RETURN; -- 0 righe per qualunque company non-demo
  END IF;

  -- Defense 2: il caller deve essere effettivamente nella demo company
  SELECT p.company_id INTO v_caller_company_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1;

  IF v_caller_company_id IS DISTINCT FROM v_demo_company_id THEN
    RETURN; -- 0 righe per caller non-demo (anche se passa company_id corretto)
  END IF;

  -- OK, ritorna i KPI
  RETURN QUERY
  SELECT
    a.feature,
    a.model_id,
    a.provider,
    count(*)::bigint AS total_calls,
    ROUND(avg(a.cost_usd)::numeric, 6) AS avg_cost_usd,
    ROUND(sum(a.cost_usd)::numeric, 4) AS total_cost_usd,
    ROUND(avg(a.latency_ms)::numeric, 0) AS avg_latency_ms,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY a.latency_ms) AS p50_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY a.latency_ms) AS p95_latency_ms,
    ROUND(avg(a.input_tokens)::numeric, 0) AS avg_input_tokens,
    ROUND(avg(a.output_tokens)::numeric, 0) AS avg_output_tokens,
    ROUND(avg(a.user_rating)::numeric, 2) AS avg_rating,
    count(*) FILTER (WHERE a.user_rating IS NOT NULL)::bigint AS ratings_count,
    count(*) FILTER (WHERE a.error IS NOT NULL)::bigint AS errors_count
  FROM public.ai_test_runs a
  WHERE a.company_id = p_company_id
    AND a.created_at >= p_from
    AND a.created_at <= p_to
  GROUP BY a.feature, a.model_id, a.provider
  ORDER BY total_calls DESC, total_cost_usd DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_test_lab_kpi(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.ai_test_lab_kpi IS
  'AI Test Lab — KPI dashboard. Hardened: rifiuta company_id != demo + caller non in demo company.';
