-- Tabella override prezzi per azienda
CREATE TABLE IF NOT EXISTS company_billing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service TEXT NOT NULL DEFAULT 'plan',
  custom_plan_price_eur NUMERIC,
  override_notes TEXT,
  override_expires_at TIMESTAMPTZ,
  is_enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, service)
);

ALTER TABLE company_billing_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_only" ON company_billing_overrides
  USING (auth.jwt() ->> 'role' IN ('super_admin','admin'));
