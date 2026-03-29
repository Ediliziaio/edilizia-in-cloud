-- ============================================================
-- 4. CREA sales_playbook_completions
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_playbook_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES marketing_opportunities(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES marketing_pipeline_stages(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_description TEXT NOT NULL,
  completed_by UUID DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(opportunity_id, stage_id, step_order)
);
