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
