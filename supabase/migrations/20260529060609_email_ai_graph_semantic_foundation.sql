-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-EMAIL-AI-04 · Fondazione grafo + ricerca semantica (ADDITIVA, reversibile)
-- Parte sicura: embedding (1536, allineato a brainEmbed OpenAI), audit accessi,
-- estensione email_threads esistente. ACL per ruolo = decisione Florin (vedi MAP §6).

-- 1) Embedding sul corpo email (pgvector già installato)
ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_personale boolean NOT NULL DEFAULT false;

-- Indice ivfflat per ricerca coseno (creato solo se non esiste)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_email_inbox_embedding') THEN
    CREATE INDEX idx_email_inbox_embedding ON public.email_inbox
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_inbox_embed_pending
  ON public.email_inbox (company_id, received_at DESC)
  WHERE embedding IS NULL AND is_personale = false;

-- 2) Estensione email_threads (thread aziendale) — additiva
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS thread_key text,
  ADD COLUMN IF NOT EXISTS oggetto_canonico text,
  ADD COLUMN IF NOT EXISTS entita_tipo text,
  ADD COLUMN IF NOT EXISTS entita_id uuid;

CREATE INDEX IF NOT EXISTS idx_email_threads_thread_key
  ON public.email_threads (company_id, thread_key) WHERE thread_key IS NOT NULL;

-- 3) Audit accessi (GDPR + tutela dipendenti)
CREATE TABLE IF NOT EXISTS public.email_accessi (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,                 -- chi ha letto
  email_id    uuid,
  thread_id   uuid,
  via         text NOT NULL,                  -- 'ui'|'silvio_query'|'export'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_accessi_company ON public.email_accessi (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_accessi_email ON public.email_accessi (email_id);

ALTER TABLE public.email_accessi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_accessi_company_read ON public.email_accessi;
CREATE POLICY email_accessi_company_read ON public.email_accessi FOR SELECT TO authenticated USING (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_accessi_service_all ON public.email_accessi;
CREATE POLICY email_accessi_service_all ON public.email_accessi FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS email_accessi_super_admin ON public.email_accessi;
CREATE POLICY email_accessi_super_admin ON public.email_accessi FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 4) RPC ricerca semantica (company-scoped via RLS esistente; ACL ruolo = follow-up)
-- Esclude email personali dal risultato (privacy). p_query_embedding = vector(1536).
CREATE OR REPLACE FUNCTION public.email_semantic_search(
  p_query_embedding vector(1536),
  p_limit int DEFAULT 20
) RETURNS TABLE (
  email_id uuid,
  thread_id uuid,
  subject text,
  from_email text,
  received_at timestamptz,
  categoria text,
  score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.id, e.thread_id, e.subject, e.from_email, e.received_at,
         COALESCE(e.categoria::text, e.ai_category, 'altro'),
         ROUND((1 - (e.embedding <=> p_query_embedding))::numeric, 4) AS score
  FROM public.email_inbox e
  WHERE e.company_id = v_company_id
    AND e.embedding IS NOT NULL
    AND e.is_personale = false
    AND e.is_trashed = false
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(p_limit, 50);
END $$;
GRANT EXECUTE ON FUNCTION public.email_semantic_search(vector, int) TO authenticated, service_role;

-- 5) RPC ricerca strutturata (filtri whitelist — MAI SQL da stringa libera AI)
CREATE OR REPLACE FUNCTION public.email_structured_search(
  p_entita_nome text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL,
  p_limit int DEFAULT 50
) RETURNS TABLE (
  email_id uuid, thread_id uuid, subject text, from_email text,
  received_at timestamptz, categoria text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.id, e.thread_id, e.subject, e.from_email, e.received_at,
         COALESCE(e.categoria::text, e.ai_category, 'altro')
  FROM public.email_inbox e
  WHERE e.company_id = v_company_id
    AND e.is_trashed = false
    AND e.is_personale = false
    AND (p_entita_nome IS NULL OR e.from_email ILIKE '%' || p_entita_nome || '%' OR e.from_name ILIKE '%' || p_entita_nome || '%' OR e.subject ILIKE '%' || p_entita_nome || '%')
    AND (p_categoria IS NULL OR e.categoria::text = p_categoria OR e.ai_category = p_categoria)
    AND (p_da IS NULL OR e.received_at >= p_da)
    AND (p_a IS NULL OR e.received_at < (p_a + 1))
  ORDER BY e.received_at DESC
  LIMIT LEAST(p_limit, 100);
END $$;
GRANT EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) TO authenticated, service_role;

-- 6) RPC log accesso
CREATE OR REPLACE FUNCTION public.log_email_accesso(p_email_id uuid, p_thread_id uuid, p_via text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.email_accessi (company_id, user_id, email_id, thread_id, via)
  VALUES (v_company_id, auth.uid(), p_email_id, p_thread_id, COALESCE(p_via, 'ui'));
END $$;
GRANT EXECUTE ON FUNCTION public.log_email_accesso(uuid, uuid, text) TO authenticated;

COMMENT ON COLUMN public.email_inbox.embedding IS 'MP-EMAIL-AI-04: embedding OpenAI text-embedding-3-small (1536) del corpo. NULL = da generare. Mai per email personali.';
COMMENT ON COLUMN public.email_inbox.is_personale IS 'MP-EMAIL-AI-04: email marcata personale dal dipendente → esclusa da ricerca semantica e vista admin.';
COMMENT ON TABLE public.email_accessi IS 'MP-EMAIL-AI-04: audit accessi email (GDPR + tutela dipendenti).';
