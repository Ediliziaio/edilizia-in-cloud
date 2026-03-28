CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_integrations_primary
  ON billing_integrations(company_id)
  WHERE is_primary = true AND is_active = true;
