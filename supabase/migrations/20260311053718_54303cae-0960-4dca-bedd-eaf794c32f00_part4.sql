-- ============================================================
-- 2. ESTENDI marketing_pipeline_stages
-- ============================================================
ALTER TABLE marketing_pipeline_stages
  ADD COLUMN IF NOT EXISTS win_probability INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_duration_days INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stalled_threshold_days INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS playbook JSONB DEFAULT '[]'::jsonb;
