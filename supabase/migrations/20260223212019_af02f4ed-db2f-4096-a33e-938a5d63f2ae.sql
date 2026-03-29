-- Performance indices for most queried tables
CREATE INDEX IF NOT EXISTS idx_automation_flows_company_status ON automation_flows(company_id, status);
