-- 3. RPC for MRR movements
DROP FUNCTION IF EXISTS public.get_mrr_movements_monthly(INT) CASCADE;
CREATE OR REPLACE FUNCTION public.get_mrr_movements_monthly(
  p_months INT DEFAULT 6
)
RETURNS TABLE (
  month          TEXT,
  new_mrr        NUMERIC,
  expansion_mrr  NUMERIC,
  contraction_mrr NUMERIC,
  churn_mrr      NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH monthly AS (
    SELECT
      TO_CHAR(DATE_TRUNC('month', sl.started_at), 'Mon YY') AS m_label,
      DATE_TRUNC('month', sl.started_at) AS month_date,
      SUM(
        CASE
          WHEN sl.previous_plan_id IS NULL AND sp.price > 0 THEN sp.price
          ELSE 0
        END
      ) AS m_new_mrr,
      SUM(
        CASE
          WHEN sl.previous_plan_id IS NOT NULL
               AND sp.price > COALESCE(prev_sp.price, 0) THEN sp.price - COALESCE(prev_sp.price, 0)
          ELSE 0
        END
      ) AS m_expansion_mrr,
      SUM(
        CASE
          WHEN sl.previous_plan_id IS NOT NULL
               AND sp.price < COALESCE(prev_sp.price, 0) THEN COALESCE(prev_sp.price, 0) - sp.price
          ELSE 0
        END
      ) AS m_contraction_mrr,
      SUM(
        CASE
          WHEN sl.status = 'cancelled' THEN COALESCE(prev_sp.price, sp.price, 0)
          ELSE 0
        END
      ) AS m_churn_mrr
    FROM public.subscription_logs sl
    LEFT JOIN public.subscription_plans sp      ON sp.id = sl.plan_id
    LEFT JOIN public.subscription_plans prev_sp ON prev_sp.id = sl.previous_plan_id
    WHERE sl.started_at >= NOW() - (p_months || ' months')::INTERVAL
    GROUP BY month_date, m_label
    ORDER BY month_date
  )
  SELECT
    monthly.m_label,
    COALESCE(monthly.m_new_mrr, 0)::NUMERIC,
    COALESCE(monthly.m_expansion_mrr, 0)::NUMERIC,
    COALESCE(monthly.m_contraction_mrr, 0)::NUMERIC,
    COALESCE(monthly.m_churn_mrr, 0)::NUMERIC
  FROM monthly;
END;
$$;
