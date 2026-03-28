-- 8. ElevenLabs config
CREATE TABLE IF NOT EXISTS ai_elevenlabs_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  api_key_encrypted     TEXT,
  api_key_valida        BOOLEAN DEFAULT FALSE,
  ultima_verifica       TIMESTAMPTZ,
  crediti_rimanenti     FLOAT DEFAULT 0,
  crediti_totali        FLOAT DEFAULT 0,
  piano                 TEXT,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
