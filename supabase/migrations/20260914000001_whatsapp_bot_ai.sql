-- ============================================
-- WhatsApp Bot AI per Cantiere - Migration
-- ============================================

-- 1. whatsapp_sessions (created BEFORE whatsapp_messages due to FK)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  operaio_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  current_cantiere_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  state TEXT DEFAULT 'idle' CHECK (state IN (
    'idle', 'awaiting_cantiere', 'awaiting_confirmation',
    'collecting_rapportino', 'collecting_presenze'
  )),
  state_data JSONB DEFAULT '{}',
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sessions_phone ON whatsapp_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_company ON whatsapp_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_operaio ON whatsapp_sessions(operaio_id);

-- 2. whatsapp_messages (immutable audit log)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cantiere_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  operaio_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  wa_message_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'text', 'image', 'document', 'audio', 'video', 'location', 'sticker'
  )),
  content_text TEXT,
  media_url TEXT,
  media_storage_path TEXT,
  ai_intent TEXT CHECK (ai_intent IN (
    'rapportino', 'ddt', 'foto_cantiere', 'presenze',
    'segnalazione', 'domanda', 'conferma', 'annulla', 'unknown'
  )),
  ai_confidence NUMERIC(3,2),
  ai_extracted_data JSONB DEFAULT '{}',
  processing_status TEXT DEFAULT 'received' CHECK (processing_status IN (
    'received', 'processing', 'processed', 'failed', 'requires_confirmation'
  )),
  processing_error TEXT,
  linked_record_type TEXT,
  linked_record_id UUID,
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_company ON whatsapp_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_operaio ON whatsapp_messages(operaio_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_cantiere ON whatsapp_messages(cantiere_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_session ON whatsapp_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_status ON whatsapp_messages(processing_status);

-- 3. Bot-specific columns on existing messaging_whatsapp_config
ALTER TABLE messaging_whatsapp_config
  ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_auto_process BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_assign_cantiere BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_titolare_on_rapportino BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_titolare_on_ddt BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_titolare_on_segnalazione BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT 'Ciao! Sono l''assistente di cantiere. Mandami foto di DDT, rapportini, o scrivimi cosa hai fatto oggi.';

-- 4. Source columns on existing tables
ALTER TABLE campo_rapportini ADD COLUMN IF NOT EXISTS
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp', 'campo', 'api'));

ALTER TABLE ddt_ricezione ADD COLUMN IF NOT EXISTS
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp', 'campo', 'api'));

ALTER TABLE hr_giornate ADD COLUMN IF NOT EXISTS
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp', 'campo', 'api'));

ALTER TABLE foto_cantiere ADD COLUMN IF NOT EXISTS
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp', 'campo', 'api'));

-- 5. phone_whatsapp on employees for bot matching
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_whatsapp TEXT;
CREATE INDEX IF NOT EXISTS idx_employees_phone_wa ON employees(phone_whatsapp);

-- 6. RLS Policies
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_messages_company ON whatsapp_messages
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_sessions_company ON whatsapp_sessions
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
