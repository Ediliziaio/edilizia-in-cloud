-- ════════════════════════════════════════════════════════════════
-- TABELLA 1: Configurazione integrazione per company
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS billing_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  is_primary  BOOLEAN DEFAULT false,
  access_token        TEXT,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  api_key             TEXT,
  company_external_id TEXT,
  provider_company_name TEXT,
  provider_vat_number TEXT,
  auto_sync       BOOLEAN DEFAULT true,
  sync_direction  TEXT DEFAULT 'both',
  last_sync_at    TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, provider)
);
