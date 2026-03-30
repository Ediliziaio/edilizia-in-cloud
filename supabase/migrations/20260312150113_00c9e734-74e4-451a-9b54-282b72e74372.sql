DROP FUNCTION IF EXISTS public.get_mrr_movements_monthly(INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION public.get_mrr_movements_monthly(p_months INTEGER DEFAULT 6)
RETURNS TABLE(
  month TEXT,
  new_mrr NUMERIC,
  expansion_mrr NUMERIC,
  contraction_mrr NUMERIC,
  churn_mrr NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH monthly AS (
    SELECT
      TO_CHAR(DATE_TRUNC('month', sl.created_at), 'Mon YY') AS m_label,
      DATE_TRUNC('month', sl.created_at) AS month_date,
      SUM(
        CASE
          WHEN sl.previous_plan_id IS NULL AND sp.price_monthly > 0 THEN sp.price_monthly
          ELSE 0
        END
      ) AS m_new_mrr,
      SUM(
        CASE
          WHEN sl.previous_plan_id IS NOT NULL
               AND sp.price_monthly > COALESCE(prev_sp.price_monthly, 0) THEN sp.price_monthly - COALESCE(prev_sp.price_monthly, 0)
          ELSE 0
        END
      ) AS m_expansion_mrr,
      SUM(
        CASE
          WHEN sl.previous_plan_id IS NOT NULL
               AND sp.price_monthly < COALESCE(prev_sp.price_monthly, 0) THEN COALESCE(prev_sp.price_monthly, 0) - sp.price_monthly
          ELSE 0
        END
      ) AS m_contraction_mrr,
      SUM(
        CASE
          WHEN sl.new_status = 'cancelled' THEN COALESCE(prev_sp.price_monthly, sp.price_monthly, 0)
          ELSE 0
        END
      ) AS m_churn_mrr
    FROM public.subscription_logs sl
    LEFT JOIN public.subscription_plans sp      ON sp.id = sl.plan_id
    LEFT JOIN public.subscription_plans prev_sp ON prev_sp.id = sl.previous_plan_id
    WHERE sl.created_at >= NOW() - (p_months || ' months')::INTERVAL
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