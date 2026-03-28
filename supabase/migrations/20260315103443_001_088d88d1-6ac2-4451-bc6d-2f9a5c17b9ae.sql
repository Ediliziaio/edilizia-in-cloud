-- 2. WhatsApp numbers (must exist before ai_agents_v2 references it)
CREATE TABLE IF NOT EXISTS ai_whatsapp_numbers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  numero                TEXT NOT NULL,
  nome_account          TEXT,
  waba_id               TEXT,
  phone_number_id       TEXT,
  access_token_encrypted TEXT,
  stato                 TEXT DEFAULT 'non_configurato',
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
