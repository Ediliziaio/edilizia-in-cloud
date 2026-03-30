-- ============================================================
-- 6. RPC: get_weighted_pipeline
-- ============================================================
DROP FUNCTION IF EXISTS public.get_weighted_pipeline(UUID) CASCADE;
CREATE OR REPLACE FUNCTION get_weighted_pipeline(p_company_id UUID)
RETURNS TABLE (
  pipeline_id UUID,
  pipeline_name TEXT,
  stage_id UUID,
  stage_name TEXT,
  stage_position INTEGER,
  opportunity_count BIGINT,
  total_value DECIMAL,
  weighted_value DECIMAL,
  avg_probability INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_position INTEGER;
BEGIN
  SELECT MAX(ps.position) INTO v_max_position
  FROM marketing_pipeline_stages ps
  WHERE ps.company_id = p_company_id;

  RETURN QUERY
  SELECT
    p.id AS pipeline_id,
    p.name AS pipeline_name,
    ps.id AS stage_id,
    ps.name AS stage_name,
    ps.position AS stage_position,
    COUNT(o.id) AS opportunity_count,
    COALESCE(SUM(o.value), 0) AS total_value,
    COALESCE(SUM(
      o.value * (
        COALESCE(
          o.probability,
          ps.win_probability,
          ROUND((0.1 + 0.8 * COALESCE(
            CAST(ps.position AS DECIMAL) / NULLIF(CAST(v_max_position AS DECIMAL), 0),
            0.5
          )) * 100)
        ) / 100.0
      )
    ), 0) AS weighted_value,
    ROUND(AVG(
      COALESCE(
        o.probability,
        ps.win_probability,
        ROUND((0.1 + 0.8 * COALESCE(
          CAST(ps.position AS DECIMAL) / NULLIF(CAST(v_max_position AS DECIMAL), 0),
          0.5
        )) * 100)
      )
    ))::INTEGER AS avg_probability
  FROM marketing_pipelines p
  INNER JOIN marketing_pipeline_stages ps ON ps.pipeline_id = p.id AND ps.company_id = p_company_id
  LEFT JOIN marketing_opportunities o ON o.stage_id = ps.id AND o.company_id = p_company_id AND o.status = 'open'
  WHERE p.company_id = p_company_id
  GROUP BY p.id, p.name, ps.id, ps.name, ps.position
  ORDER BY p.name, ps.position;
END;
$$;
