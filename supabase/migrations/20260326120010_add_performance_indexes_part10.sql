CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_created ON marketing_contacts(company_id, created_at DESC);
