-- 11. RPC: get_sales_velocity
CREATE OR REPLACE FUNCTION get_sales_velocity(p_company_id UUID, p_days_back INTEGER DEFAULT 90)
RETURNS TABLE (
  open_opportunities BIGINT, win_rate DECIMAL, avg_deal_size DECIMAL,
  avg_cycle_days DECIMAL, sales_velocity DECIMAL
) AS $$
DECLARE
  v_period_start TIMESTAMPTZ := NOW() - (p_days_back || ' days')::INTERVAL;
  v_won_count BIGINT; v_lost_count BIGINT; v_open_count BIGINT;
  v_win_rate DECIMAL; v_avg_size DECIMAL; v_avg_days DECIMAL;
BEGIN
  SELECT COUNT(*) INTO v_won_count FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'won' AND updated_at >= v_period_start;

  SELECT COUNT(*) INTO v_lost_count FROM marketing_opportunities
  WHERE company_id = p_company_id AND status IN ('lost','abandoned') AND updated_at >= v_period_start;

  SELECT COUNT(*) INTO v_open_count FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'open';

  v_win_rate := CASE WHEN (v_won_count + v_lost_count) > 0
    THEN v_won_count::DECIMAL / (v_won_count + v_lost_count) ELSE 0 END;

  SELECT COALESCE(AVG(value), 0) INTO v_avg_size FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'won' AND updated_at >= v_period_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (updated_at - created_at))), 30) INTO v_avg_days
  FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'won' AND updated_at >= v_period_start;

  RETURN QUERY SELECT
    v_open_count, ROUND(v_win_rate * 100, 1), ROUND(v_avg_size, 2),
    ROUND(v_avg_days, 1),
    CASE WHEN v_avg_days > 0
      THEN ROUND((v_open_count * v_win_rate * v_avg_size) / v_avg_days, 2)
      ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
