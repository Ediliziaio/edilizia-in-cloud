-- Add target and alert threshold columns to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS monthly_revenue_target NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_orders_target INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alert_late_orders_threshold INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS alert_open_tickets_threshold INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS alert_margin_min_pct NUMERIC(5,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS alert_runway_days_warning INTEGER DEFAULT 30;
