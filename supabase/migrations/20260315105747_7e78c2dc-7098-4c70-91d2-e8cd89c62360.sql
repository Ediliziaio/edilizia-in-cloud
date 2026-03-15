
-- =============================================
-- UNIF-AGE-04: KB Categories, Chat, WhatsApp extensions
-- =============================================

-- 1. ai_kb_categories
CREATE TABLE public.ai_kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descrizione text,
  colore text DEFAULT '#6366f1',
  creato_il timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_kb_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_categories_company" ON public.ai_kb_categories FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE INDEX idx_kb_categories_company ON public.ai_kb_categories(company_id);

-- 2. ALTER ai_knowledge_base_v2 - add missing columns
ALTER TABLE public.ai_knowledge_base_v2
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.ai_kb_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS parole_chiave text[],
  ADD COLUMN IF NOT EXISTS utilizzi integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Validation trigger for sync_status
CREATE OR REPLACE FUNCTION public.validate_kb_sync_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sync_status NOT IN ('pending', 'syncing', 'synced', 'error', 'deleted') THEN
    RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_kb_sync_status
  BEFORE INSERT OR UPDATE ON public.ai_knowledge_base_v2
  FOR EACH ROW EXECUTE FUNCTION public.validate_kb_sync_status();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_kb_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_kb_updated_at
  BEFORE UPDATE ON public.ai_knowledge_base_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_kb_updated_at();

CREATE INDEX idx_kb_v2_category ON public.ai_knowledge_base_v2(category_id);
CREATE INDEX idx_kb_v2_sync_status ON public.ai_knowledge_base_v2(sync_status);

-- 3. ALTER ai_whatsapp_numbers - add missing columns
ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS webhook_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS messaggio_benvenuto text,
  ADD COLUMN IF NOT EXISTS messaggio_fuori_orario text,
  ADD COLUMN IF NOT EXISTS orario_attivo jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_wa_numbers_agent ON public.ai_whatsapp_numbers(agent_id);

-- 4. ai_chat_sessions
CREATE TABLE public.ai_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents_v2(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  canale text NOT NULL DEFAULT 'web',
  stato text NOT NULL DEFAULT 'attiva',
  metadata jsonb,
  iniziata_il timestamptz NOT NULL DEFAULT now(),
  terminata_il timestamptz,
  messaggi_totali integer NOT NULL DEFAULT 0,
  durata_secondi integer NOT NULL DEFAULT 0
);
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_sessions_company" ON public.ai_chat_sessions FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE INDEX idx_chat_sessions_agent ON public.ai_chat_sessions(agent_id);
CREATE INDEX idx_chat_sessions_company ON public.ai_chat_sessions(company_id);
CREATE INDEX idx_chat_sessions_iniziata ON public.ai_chat_sessions(iniziata_il DESC);

-- Validation trigger for chat session stato
CREATE OR REPLACE FUNCTION public.validate_chat_session_stato()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stato NOT IN ('attiva', 'chiusa', 'archiviata') THEN
    RAISE EXCEPTION 'Invalid chat session stato: %', NEW.stato;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_chat_session_stato
  BEFORE INSERT OR UPDATE ON public.ai_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.validate_chat_session_stato();

-- 5. ai_chat_messages
CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  ruolo text NOT NULL DEFAULT 'user',
  contenuto text NOT NULL,
  metadata jsonb,
  creato_il timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
-- RLS via session join
CREATE POLICY "chat_messages_via_session" ON public.ai_chat_messages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_chat_sessions s
    WHERE s.id = ai_chat_messages.session_id
    AND s.company_id = public.get_my_company_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_chat_sessions s
    WHERE s.id = ai_chat_messages.session_id
    AND s.company_id = public.get_my_company_id()
  ));
CREATE INDEX idx_chat_messages_session ON public.ai_chat_messages(session_id);
CREATE INDEX idx_chat_messages_creato ON public.ai_chat_messages(creato_il);

-- Validation trigger for message ruolo
CREATE OR REPLACE FUNCTION public.validate_chat_message_ruolo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ruolo NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid message ruolo: %', NEW.ruolo;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_chat_message_ruolo
  BEFORE INSERT OR UPDATE ON public.ai_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_chat_message_ruolo();

-- 6. RPCs
CREATE OR REPLACE FUNCTION public.update_kb_sync_status(
  p_doc_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_el_doc_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_knowledge_base_v2
  SET sync_status = p_status,
      sync_error = p_error,
      elevenlabs_doc_id = COALESCE(p_el_doc_id, elevenlabs_doc_id)
  WHERE id = p_doc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_chat_stats(p_agent_id uuid)
RETURNS TABLE(
  sessioni_totali bigint,
  messaggi_totali bigint,
  durata_media_secondi numeric,
  sessioni_attive bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) AS sessioni_totali,
    COALESCE(SUM(messaggi_totali), 0) AS messaggi_totali,
    COALESCE(AVG(durata_secondi), 0) AS durata_media_secondi,
    COUNT(*) FILTER (WHERE stato = 'attiva') AS sessioni_attive
  FROM public.ai_chat_sessions
  WHERE agent_id = p_agent_id;
$$;

-- 7. Storage bucket for KB files
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-knowledge', 'ai-knowledge', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: company-scoped access
CREATE POLICY "kb_storage_company_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'ai-knowledge'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'ai-knowledge'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );
