-- ============================================================
-- FUNCTION 3: get_vendor_funnel_stages
-- ============================================================
DROP FUNCTION IF EXISTS public.get_vendor_funnel_stages(UUID, DATE, DATE, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_vendor_funnel_stages(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE(
  stage TEXT,
  count_opp BIGINT,
  valore_totale NUMERIC,
  pct_del_totale NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stage_data AS (
    SELECT
      COALESCE(ps.name, o.status) AS stage_name,
      COUNT(*) AS cnt,
      COALESCE(SUM(o.value), 0) AS val
    FROM marketing_opportunities o
    LEFT JOIN marketing_pipeline_stages ps ON ps.id = o.stage_id AND ps.company_id = o.company_id
    WHERE o.company_id = p_company_id
      AND o.assigned_to IS NOT NULL
      AND o.created_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_agent_id IS NULL OR o.assigned_to = p_agent_id)
    GROUP BY stage_name
  ),
  totale AS (SELECT SUM(cnt) AS t FROM stage_data)
  SELECT
    sd.stage_name::TEXT,
    sd.cnt,
    sd.val,
    ROUND(100.0 * sd.cnt / NULLIF(t.t, 0), 1)
  FROM stage_data sd, totale t
  ORDER BY sd.val DESC;
END;
$$;
