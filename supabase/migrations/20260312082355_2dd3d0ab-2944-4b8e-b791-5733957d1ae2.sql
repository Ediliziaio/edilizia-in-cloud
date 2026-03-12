
-- 1. Email delivery log table
CREATE TABLE IF NOT EXISTS public.email_delivery_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  recipient     TEXT NOT NULL,
  subject       TEXT,
  template_type TEXT,
  provider      TEXT,
  status        TEXT NOT NULL DEFAULT 'sent',
  provider_id   TEXT,
  error_message TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_email_log"
  ON public.email_delivery_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "super_admin_read_email_log"
  ON public.email_delivery_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_email_delivery_log_sent_at
  ON public.email_delivery_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_log_status
  ON public.email_delivery_log (status, sent_at DESC);

-- 2. Add previous_plan_id to subscription_logs
ALTER TABLE public.subscription_logs
  ADD COLUMN IF NOT EXISTS previous_plan_id UUID REFERENCES public.subscription_plans(id);

-- 3. RPC for MRR movements
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

GRANT EXECUTE ON FUNCTION public.get_mrr_movements_monthly TO authenticated;
