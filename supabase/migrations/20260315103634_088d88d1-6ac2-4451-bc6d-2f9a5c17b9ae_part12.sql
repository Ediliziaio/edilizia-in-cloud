-- 4. Phone numbers (unified)
CREATE TABLE IF NOT EXISTS ai_phone_numbers_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id              UUID REFERENCES ai_agents_v2(id) ON DELETE SET NULL,
  numero                TEXT NOT NULL,
  nome_etichetta        TEXT,
  elevenlabs_phone_id   TEXT UNIQUE,
  provider              TEXT DEFAULT 'elevenlabs',
  capacita              TEXT[] DEFAULT ARRAY['inbound','outbound'],
  attivo                BOOLEAN NOT NULL DEFAULT TRUE,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
