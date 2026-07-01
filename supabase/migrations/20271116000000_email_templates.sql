CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'generale', -- 'preventivo' | 'sollecito' | 'benvenuto' | 'appuntamento' | 'generale'
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access" ON email_templates
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies
      WHERE id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid)
         OR id IN (
           SELECT company_id FROM company_users WHERE user_id = auth.uid()
         )
    )
  );

CREATE INDEX idx_email_templates_company ON email_templates(company_id);
