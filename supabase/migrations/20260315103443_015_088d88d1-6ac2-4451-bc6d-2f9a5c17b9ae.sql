-- 5. Conversations (unified)
CREATE TABLE IF NOT EXISTS ai_conversations_v2 (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id                    UUID NOT NULL REFERENCES ai_agents_v2(id) ON DELETE CASCADE,
  contact_id                  UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,

  elevenlabs_conversation_id  TEXT UNIQUE,
  canale                      TEXT NOT NULL DEFAULT 'voce',

  direzione                   TEXT,
  numero_chiamante            TEXT,
  numero_chiamato             TEXT,
  stato                       TEXT NOT NULL DEFAULT 'in_corso',

  trascrizione_json           JSONB DEFAULT '[]',
  audio_url                   TEXT,
  riassunto                   TEXT,
  sentiment                   TEXT,
  note_interne                TEXT,
  task_creati                 JSONB DEFAULT '[]',

  iniziata_il                 TIMESTAMPTZ,
  risposta_il                 TIMESTAMPTZ,
  terminata_il                TIMESTAMPTZ,
  durata_secondi              INTEGER,
  costo_crediti               FLOAT,

  creato_il                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
