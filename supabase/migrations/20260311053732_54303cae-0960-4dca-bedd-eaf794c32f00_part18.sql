CREATE INDEX IF NOT EXISTS idx_contacts_lead_score
  ON marketing_contacts(company_id, lead_score DESC);
