
-- SO1: Sales OS Schema Migration (adjusted for existing sales_targets)

-- 1. ESTENDI marketing_opportunities
ALTER TABLE marketing_opportunities
  ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_close_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_action TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_action_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason_category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS competitor_won TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stalled_notified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sales_velocity_snapshot JSONB DEFAULT NULL;

-- 2. ESTENDI marketing_pipeline_stages
ALTER TABLE marketing_pipeline_stages
  ADD COLUMN IF NOT EXISTS win_probability INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_duration_days INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stalled_threshold_days INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS playbook JSONB DEFAULT '[]'::jsonb;

-- 3. ESTENDI marketing_contacts
ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icp_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS icp_tier TEXT DEFAULT NULL;

-- 4. Extend existing sales_targets with new columns
ALTER TABLE sales_targets
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS month INTEGER,
  ADD COLUMN IF NOT EXISTS target_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_deals INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 5. CREA sales_playbook_completions
CREATE TABLE IF NOT EXISTS sales_playbook_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES marketing_opportunities(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES marketing_pipeline_stages(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_description TEXT NOT NULL,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(opportunity_id, stage_id, step_order)
);

-- 6. RLS (sales_targets likely already has RLS)
ALTER TABLE sales_playbook_completions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sales_playbook_completions' AND policyname = 'playbook_completions_company_isolation'
  ) THEN
    CREATE POLICY "playbook_completions_company_isolation"
      ON sales_playbook_completions FOR ALL
      USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- 7. INDEXES
CREATE INDEX IF NOT EXISTS idx_opp_expected_close
  ON marketing_opportunities(company_id, expected_close_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_opp_stalled
  ON marketing_opportunities(company_id, stalled_notified_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_opp_next_action_date
  ON marketing_opportunities(company_id, next_action_date)
  WHERE status = 'open' AND next_action_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score
  ON marketing_contacts(company_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_sales_targets_lookup
  ON sales_targets(company_id, year, month);

-- 8. RPC: get_weighted_pipeline
CREATE OR REPLACE FUNCTION get_weighted_pipeline(p_company_id UUID)
RETURNS TABLE (
  pipeline_id UUID, pipeline_name TEXT, stage_id UUID, stage_name TEXT,
  stage_position INTEGER, opportunity_count BIGINT, total_value DECIMAL,
  weighted_value DECIMAL, avg_probability INTEGER
) AS $$
DECLARE v_max_position INTEGER;
BEGIN
  SELECT MAX(ps.position) INTO v_max_position
  FROM marketing_pipeline_stages ps WHERE ps.company_id = p_company_id;

  RETURN QUERY
  SELECT
    p.id, p.name, ps.id, ps.name, ps.position,
    COUNT(o.id),
    COALESCE(SUM(o.value), 0),
    COALESCE(SUM(o.value * (
      COALESCE(o.probability, ps.win_probability,
        ROUND((0.1 + 0.8 * COALESCE(CAST(ps.position AS DECIMAL) /
        NULLIF(CAST(v_max_position AS DECIMAL), 0), 0.5)) * 100)
      ) / 100.0
    )), 0),
    ROUND(AVG(COALESCE(o.probability, ps.win_probability,
      ROUND((0.1 + 0.8 * COALESCE(CAST(ps.position AS DECIMAL) /
      NULLIF(CAST(v_max_position AS DECIMAL), 0), 0.5)) * 100)
    )))::INTEGER
  FROM marketing_pipelines p
  INNER JOIN marketing_pipeline_stages ps ON ps.pipeline_id = p.id AND ps.company_id = p_company_id
  LEFT JOIN marketing_opportunities o ON o.stage_id = ps.id
    AND o.company_id = p_company_id AND o.status = 'open'
  WHERE p.company_id = p_company_id
  GROUP BY p.id, p.name, ps.id, ps.name, ps.position
  ORDER BY p.name, ps.position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

-- 10. RPC: get_stalled_opportunities
CREATE OR REPLACE FUNCTION get_stalled_opportunities(p_company_id UUID)
RETURNS TABLE (
  opportunity_id UUID, opportunity_name TEXT, contact_name TEXT, stage_name TEXT,
  assigned_to UUID, last_activity_at TIMESTAMPTZ, days_stalled INTEGER,
  stalled_threshold INTEGER, value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id, o.name,
    CONCAT(mc.first_name, ' ', mc.last_name),
    ps.name, o.assigned_to,
    COALESCE(
      (SELECT MAX(mca.created_at) FROM marketing_contact_activities mca
       WHERE mca.company_id = p_company_id
       AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)),
      o.updated_at, o.created_at
    ),
    EXTRACT(DAY FROM NOW() - COALESCE(
      (SELECT MAX(mca.created_at) FROM marketing_contact_activities mca
       WHERE mca.company_id = p_company_id
       AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)),
      o.updated_at, o.created_at
    ))::INTEGER,
    COALESCE(ps.stalled_threshold_days, 14),
    o.value
  FROM marketing_opportunities o
  INNER JOIN marketing_pipeline_stages ps ON ps.id = o.stage_id
  LEFT JOIN marketing_contacts mc ON mc.id = o.contact_id
  WHERE o.company_id = p_company_id AND o.status = 'open'
    AND EXTRACT(DAY FROM NOW() - COALESCE(
      (SELECT MAX(mca.created_at) FROM marketing_contact_activities mca
       WHERE mca.company_id = p_company_id
       AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)),
      o.updated_at, o.created_at
    )) >= COALESCE(ps.stalled_threshold_days, 14)
  ORDER BY 7 DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
