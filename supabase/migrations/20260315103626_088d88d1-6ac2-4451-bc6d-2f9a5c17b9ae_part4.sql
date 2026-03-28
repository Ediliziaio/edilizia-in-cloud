-- 3. Unified ai_agents_v2
CREATE TABLE IF NOT EXISTS ai_agents_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Identity
  nome                  TEXT NOT NULL,
  descrizione           TEXT,
  tipo                  tipo_agente_enum NOT NULL DEFAULT 'vocale',
  avatar_url            TEXT,
  stato                 TEXT NOT NULL DEFAULT 'bozza',

  -- Personality
  system_prompt         TEXT,
  primo_messaggio       TEXT,
  lingua                TEXT NOT NULL DEFAULT 'it',
  temperatura           FLOAT NOT NULL DEFAULT 0.7,

  -- ElevenLabs
  elevenlabs_agent_id   TEXT UNIQUE,
  elevenlabs_voice_id   TEXT,
  voice_nome            TEXT,

  -- Voice behavior
  risposta_automatica   BOOLEAN NOT NULL DEFAULT TRUE,
  registra_chiamate     BOOLEAN NOT NULL DEFAULT TRUE,
  trascrivi_chiamate    BOOLEAN NOT NULL DEFAULT TRUE,
  rileva_segreteria     BOOLEAN NOT NULL DEFAULT FALSE,
  squillo_max           INTEGER NOT NULL DEFAULT 4,
  durata_max_secondi    INTEGER NOT NULL DEFAULT 600,

  -- Chat config
  widget_colore         TEXT DEFAULT '#3b82f6',
  widget_posizione      TEXT DEFAULT 'bottom-right',
  widget_titolo         TEXT,
  chat_avatar_url       TEXT,
  siti_web_autorizzati  TEXT[],

  -- WhatsApp
  whatsapp_numero_id    UUID REFERENCES ai_whatsapp_numbers(id) ON DELETE SET NULL,
  whatsapp_template_id  TEXT,

  -- CRM actions
  azioni_abilitate      JSONB NOT NULL DEFAULT '["crea_task","aggiorna_contatto"]'::jsonb,

  -- Stats (updated by triggers/edge functions)
  chiamate_totali       INTEGER NOT NULL DEFAULT 0,
  chiamate_completate   INTEGER NOT NULL DEFAULT 0,
  minuti_totali         FLOAT NOT NULL DEFAULT 0,
  chat_totali           INTEGER NOT NULL DEFAULT 0,
  costo_totale_crediti  FLOAT NOT NULL DEFAULT 0,

  -- LLM model
  llm_model             TEXT NOT NULL DEFAULT 'gemini-2.5-flash',

  -- Internal agent tools
  enabled_tools         TEXT[] DEFAULT ARRAY['identify_caller','get_client_info','get_order_status'],
  tools_config          JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creato_da             UUID REFERENCES auth.users(id)
);
