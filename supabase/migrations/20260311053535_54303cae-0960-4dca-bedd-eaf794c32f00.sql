-- SO1: Sales OS Schema Migration
-- Aggiunge campi necessari alle tabelle esistenti e crea nuove tabelle

-- ============================================================
-- 1. ESTENDI marketing_opportunities
-- (probability e expected_close_date esistono già, skip)
-- (loss_reason e loss_notes esistono già, skip)
-- ============================================================
ALTER TABLE marketing_opportunities
  ADD COLUMN IF NOT EXISTS next_action TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_action_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason_category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS competitor_won TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stalled_notified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sales_velocity_snapshot JSONB DEFAULT NULL;
