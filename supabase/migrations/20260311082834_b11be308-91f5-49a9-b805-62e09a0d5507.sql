
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
