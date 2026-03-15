
-- 1. Enum tipo agente
DO $$ BEGIN
  CREATE TYPE tipo_agente_enum AS ENUM ('vocale','chat','whatsapp','interno','campagna');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
ALTER TABLE ai_whatsapp_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_company_isolation" ON ai_whatsapp_numbers
  USING (company_id = public.get_my_company_id());

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

-- Validation trigger for stato
CREATE OR REPLACE FUNCTION validate_ai_agent_v2_stato()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stato NOT IN ('bozza','attivo','pausa','archiviato') THEN
    RAISE EXCEPTION 'Stato non valido: %', NEW.stato;
  END IF;
  IF NEW.temperatura < 0 OR NEW.temperatura > 1 THEN
    RAISE EXCEPTION 'Temperatura deve essere tra 0 e 1';
  END IF;
  IF NEW.widget_posizione IS NOT NULL AND NEW.widget_posizione NOT IN ('bottom-right','bottom-left','top-right','top-left') THEN
    RAISE EXCEPTION 'Posizione widget non valida: %', NEW.widget_posizione;
  END IF;
  NEW.aggiornato_il := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ai_agent_v2
  BEFORE INSERT OR UPDATE ON ai_agents_v2
  FOR EACH ROW EXECUTE FUNCTION validate_ai_agent_v2_stato();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_agents_v2_company ON ai_agents_v2(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_v2_tipo ON ai_agents_v2(company_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ai_agents_v2_stato ON ai_agents_v2(company_id, stato);

-- RLS
ALTER TABLE ai_agents_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agents_v2_company_isolation" ON ai_agents_v2
  FOR ALL USING (company_id = public.get_my_company_id());

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
ALTER TABLE ai_phone_numbers_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phone_v2_company_isolation" ON ai_phone_numbers_v2
  FOR ALL USING (company_id = public.get_my_company_id());

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

-- Validation trigger for conversations
CREATE OR REPLACE FUNCTION validate_ai_conversation_v2()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.canale NOT IN ('voce','chat','whatsapp','interno') THEN
    RAISE EXCEPTION 'Canale non valido: %', NEW.canale;
  END IF;
  IF NEW.direzione IS NOT NULL AND NEW.direzione NOT IN ('inbound','outbound') THEN
    RAISE EXCEPTION 'Direzione non valida: %', NEW.direzione;
  END IF;
  IF NEW.stato NOT IN ('in_corso','completata','fallita','no_risposta','occupato','segreteria') THEN
    RAISE EXCEPTION 'Stato conversazione non valido: %', NEW.stato;
  END IF;
  IF NEW.sentiment IS NOT NULL AND NEW.sentiment NOT IN ('positivo','neutro','negativo') THEN
    RAISE EXCEPTION 'Sentiment non valido: %', NEW.sentiment;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ai_conversation_v2
  BEFORE INSERT OR UPDATE ON ai_conversations_v2
  FOR EACH ROW EXECUTE FUNCTION validate_ai_conversation_v2();

CREATE INDEX IF NOT EXISTS idx_ai_conv_v2_agent ON ai_conversations_v2(agent_id, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conv_v2_contact ON ai_conversations_v2(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_v2_el ON ai_conversations_v2(elevenlabs_conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_v2_stato ON ai_conversations_v2(company_id, stato);

ALTER TABLE ai_conversations_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_v2_company_isolation" ON ai_conversations_v2
  FOR ALL USING (company_id = public.get_my_company_id());

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
ALTER TABLE ai_knowledge_base_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_v2_company_isolation" ON ai_knowledge_base_v2
  FOR ALL USING (company_id = public.get_my_company_id());

-- Pivot agent <-> KB doc
CREATE TABLE IF NOT EXISTS ai_agent_knowledge_v2 (
  agent_id  UUID NOT NULL REFERENCES ai_agents_v2(id) ON DELETE CASCADE,
  doc_id    UUID NOT NULL REFERENCES ai_knowledge_base_v2(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, doc_id)
);
ALTER TABLE ai_agent_knowledge_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ak_v2_isolation" ON ai_agent_knowledge_v2
  FOR ALL USING (EXISTS (
    SELECT 1 FROM ai_agents_v2 WHERE id = agent_id AND company_id = public.get_my_company_id()
  ));

-- 7. Campaigns
CREATE TABLE IF NOT EXISTS ai_campaigns_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id              UUID NOT NULL REFERENCES ai_agents_v2(id) ON DELETE CASCADE,
  nome                  TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'chiamata',
  stato                 TEXT NOT NULL DEFAULT 'bozza',
  totale_contatti       INTEGER NOT NULL DEFAULT 0,
  chiamate_effettuate   INTEGER NOT NULL DEFAULT 0,
  chiamate_completate   INTEGER NOT NULL DEFAULT 0,
  chiamate_no_risposta  INTEGER NOT NULL DEFAULT 0,
  schedulata_il         TIMESTAMPTZ,
  completata_il         TIMESTAMPTZ,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Validation trigger for campaigns
CREATE OR REPLACE FUNCTION validate_ai_campaign_v2()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo NOT IN ('chiamata','whatsapp','sms') THEN
    RAISE EXCEPTION 'Tipo campagna non valido: %', NEW.tipo;
  END IF;
  IF NEW.stato NOT IN ('bozza','in_corso','completata','pausa','archiviata') THEN
    RAISE EXCEPTION 'Stato campagna non valido: %', NEW.stato;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ai_campaign_v2
  BEFORE INSERT OR UPDATE ON ai_campaigns_v2
  FOR EACH ROW EXECUTE FUNCTION validate_ai_campaign_v2();

ALTER TABLE ai_campaigns_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_v2_company_isolation" ON ai_campaigns_v2
  FOR ALL USING (company_id = public.get_my_company_id());

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
ALTER TABLE ai_elevenlabs_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "el_config_company_isolation" ON ai_elevenlabs_config
  FOR ALL USING (company_id = public.get_my_company_id());

-- 9. RPC stats
CREATE OR REPLACE FUNCTION get_ai_company_stats(p_company_id UUID, p_giorni INTEGER DEFAULT 30)
RETURNS TABLE(
  agenti_attivi BIGINT,
  conv_totali BIGINT,
  minuti_totali FLOAT,
  chat_totali BIGINT,
  tasso_risposta FLOAT,
  crediti_usati FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM ai_agents_v2 WHERE company_id = p_company_id AND stato = 'attivo'),
    (SELECT COUNT(*) FROM ai_conversations_v2 WHERE company_id = p_company_id
      AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COALESCE(SUM(durata_secondi), 0)::FLOAT / 60.0 FROM ai_conversations_v2
      WHERE company_id = p_company_id AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COUNT(*) FROM ai_conversations_v2 WHERE company_id = p_company_id
      AND canale IN ('chat','whatsapp') AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT CASE WHEN COUNT(*) = 0 THEN 0::FLOAT
      ELSE COUNT(*) FILTER (WHERE stato = 'completata')::FLOAT / COUNT(*)::FLOAT * 100
      END FROM ai_conversations_v2
      WHERE company_id = p_company_id AND direzione = 'outbound'
        AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COALESCE(SUM(costo_crediti), 0)::FLOAT FROM ai_conversations_v2
      WHERE company_id = p_company_id AND creato_il >= NOW() - (p_giorni || ' days')::interval);
END;
$$;

-- 10. Migrate existing data from ai_agents to ai_agents_v2
INSERT INTO ai_agents_v2 (
  id, company_id, nome, descrizione, tipo, stato,
  system_prompt, primo_messaggio, lingua,
  elevenlabs_agent_id, elevenlabs_voice_id,
  llm_model, tools_config, creato_il, aggiornato_il, creato_da
)
SELECT
  id, company_id, name, NULL, 'vocale'::tipo_agente_enum,
  CASE status WHEN 'active' THEN 'attivo' WHEN 'draft' THEN 'bozza' WHEN 'archived' THEN 'archiviato' ELSE 'bozza' END,
  system_prompt, first_message, language,
  elevenlabs_agent_id, voice_id,
  llm_model, tools_config, created_at, updated_at, created_by
FROM ai_agents
ON CONFLICT (id) DO NOTHING;

-- Migrate internal_ai_agents
INSERT INTO ai_agents_v2 (
  id, company_id, nome, descrizione, tipo, stato,
  system_prompt, primo_messaggio, lingua,
  elevenlabs_agent_id, elevenlabs_voice_id,
  llm_model, enabled_tools, tools_config, creato_il, aggiornato_il, creato_da
)
SELECT
  id, company_id, name, NULL, 'interno'::tipo_agente_enum,
  CASE status WHEN 'active' THEN 'attivo' WHEN 'draft' THEN 'bozza' WHEN 'archived' THEN 'archiviato' ELSE 'bozza' END,
  system_prompt, first_message, language,
  elevenlabs_agent_id, voice_id,
  llm_model, enabled_tools, tools_config, created_at, updated_at, created_by
FROM internal_ai_agents
ON CONFLICT (id) DO NOTHING;
