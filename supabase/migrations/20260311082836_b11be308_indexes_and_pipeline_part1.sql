-- 9. RPC: get_sales_forecast
CREATE OR REPLACE FUNCTION get_sales_forecast(p_company_id UUID, p_months_ahead INTEGER DEFAULT 3)
RETURNS TABLE (
  forecast_month DATE, expected_revenue DECIMAL, weighted_revenue DECIMAL,
  opportunity_count BIGINT
) AS $$
DECLARE v_max_position INTEGER;
BEGIN
  SELECT MAX(ps.position) INTO v_max_position
  FROM marketing_pipeline_stages ps WHERE ps.company_id = p_company_id;

  RETURN QUERY
  SELECT
    DATE_TRUNC('month', o.expected_close_date)::DATE,
    SUM(o.value),
    SUM(o.value * (COALESCE(o.probability, ps.win_probability,
      ROUND((0.1 + 0.8 * COALESCE(CAST(ps.position AS DECIMAL) /
      NULLIF(CAST(v_max_position AS DECIMAL), 0), 0.5)) * 100)
    ) / 100.0)),
    COUNT(o.id)
  FROM marketing_opportunities o
  INNER JOIN marketing_pipeline_stages ps ON ps.id = o.stage_id
  WHERE o.company_id = p_company_id AND o.status = 'open'
    AND o.expected_close_date IS NOT NULL
    AND o.expected_close_date >= DATE_TRUNC('month', NOW())
    AND o.expected_close_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month' * p_months_ahead
  GROUP BY DATE_TRUNC('month', o.expected_close_date)
  ORDER BY forecast_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
