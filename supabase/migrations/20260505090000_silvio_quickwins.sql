-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-23 — Quick Wins (FASE K) — finalizzazione
-- ════════════════════════════════════════════════════════════════════════════
-- 1. RPC silvio_ai_usage_stats (per SuperAdmin Brand panel + per company)
-- 2. RPC silvio_ai_capabilities_index (lista TUTTI i tool/edge AI per docs)
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) RPC: silvio_ai_usage_stats
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_ai_usage_stats(
  p_company_id uuid DEFAULT NULL,  -- null = tutte (super_admin)
  p_days_back int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
  v_per_task jsonb;
  v_per_company jsonb;
BEGIN
  -- Stats globali
  SELECT jsonb_build_object(
    'periodo_giorni', p_days_back,
    'totale_chiamate', count(*),
    'success_rate_pct', ROUND(100.0 * count(*) FILTER (WHERE status = 'success') / NULLIF(count(*), 0), 1),
    'tokens_totali', SUM(total_tokens),
    'cost_real_totale_usd', ROUND(SUM(cost_usd)::numeric, 4),
    'tasks_unici', count(DISTINCT task_key),
    'modelli_usati', count(DISTINCT model_used),
    'durata_media_ms', ROUND(AVG(duration_ms)::numeric, 0)
  ) INTO v_stats
  FROM public.ai_router_usage_log
  WHERE created_at > now() - (p_days_back || ' days')::interval
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- Per task
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.tokens DESC), '[]'::jsonb) INTO v_per_task
  FROM (
    SELECT
      task_key,
      count(*) AS chiamate,
      SUM(total_tokens) AS tokens,
      ROUND(SUM(cost_usd)::numeric, 4) AS cost_usd,
      count(*) FILTER (WHERE status = 'success') AS successi,
      count(*) FILTER (WHERE status != 'success') AS errori
    FROM public.ai_router_usage_log
    WHERE created_at > now() - (p_days_back || ' days')::interval
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY task_key
    ORDER BY SUM(total_tokens) DESC NULLS LAST
    LIMIT 30
  ) s;

  -- Per company (solo se super_admin → company_id is null)
  IF p_company_id IS NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.tokens DESC), '[]'::jsonb) INTO v_per_company
    FROM (
      SELECT
        company_id,
        count(*) AS chiamate,
        SUM(total_tokens) AS tokens,
        ROUND(SUM(cost_usd)::numeric, 4) AS cost_usd
      FROM public.ai_router_usage_log
      WHERE created_at > now() - (p_days_back || ' days')::interval
        AND company_id IS NOT NULL
      GROUP BY company_id
      ORDER BY SUM(total_tokens) DESC NULLS LAST
      LIMIT 50
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'stats', COALESCE(v_stats, '{}'::jsonb),
    'per_task', v_per_task,
    'per_company', COALESCE(v_per_company, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_ai_usage_stats(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_ai_usage_stats(uuid, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: silvio_ai_capabilities_index — catalog tutte le AI features
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_ai_capabilities_index()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ai_router_tasks', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.task_key), '[]'::jsonb)
      FROM (
        SELECT task_key, task_label, task_description, primary_model, tier_key, category, enabled
        FROM public.ai_router_config
        ORDER BY category, task_key
      ) s
    ),
    'silvio_rpc_count', (
      SELECT count(*) FROM pg_proc
      WHERE proname LIKE 'silvio_%'
    ),
    'edge_functions_ai_count', 30  -- aggiornato manualmente
  );
$$;

REVOKE ALL ON FUNCTION public.silvio_ai_capabilities_index() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_ai_capabilities_index() TO authenticated, service_role;
