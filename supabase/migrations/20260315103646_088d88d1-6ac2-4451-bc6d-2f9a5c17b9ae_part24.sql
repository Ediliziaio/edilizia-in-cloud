-- 6. Knowledge base
CREATE TABLE IF NOT EXISTS ai_knowledge_base_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  titolo                TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'testo',
  contenuto             TEXT,
  url                   TEXT,
  elevenlabs_doc_id     TEXT,
  sincronizzato_el      BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_sync           TIMESTAMPTZ,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
