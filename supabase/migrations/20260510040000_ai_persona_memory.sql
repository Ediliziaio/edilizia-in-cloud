-- ════════════════════════════════════════════════════════════════════════════
-- GAP 9 (Memoria personalizzata) — ai_persona_memory multi-tenant
-- ────────────────────────────────────────────────────────────────────────────
-- Tabella memoria persistente per le 18 personas LATO AZIENDA. Replicare il
-- pattern di `silvio_persona_memory` (super_admin) ma scoped per
-- (company_id, user_id, persona_key).
--
-- Effetto: il CFO AI ricorda "Florin preferisce vedere il P&L mensile vs
-- settimanale", il PM Cantiere ricorda "il cantiere XYZ va sempre in ritardo
-- a causa subappaltatore Bianchi", ecc.
--
-- L'edge ai-orchestrator carica le top-5 memory rilevanti per persona prima
-- di ogni chat, e le inietta nel system prompt come "Cose che sai dell'utente".
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Tabella ai_persona_memory ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_persona_memory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Persona di riferimento (cfo, pm_cantiere, sales, ...)
  persona_key  text NOT NULL,
  -- Tipo memoria (stesso enum di silvio_persona_memory per riusabilità)
  memory_type  text NOT NULL CHECK (memory_type IN (
    'fact',          -- es. "il P&L viene visto mensile"
    'preference',    -- es. "preferisce risposte brevi"
    'decision',      -- es. "non vuole mai email automatiche al sabato"
    'pattern',       -- es. "i cantieri Milano vanno sempre in ritardo"
    'avoid'          -- es. "evita di citare il fornitore X (litigio aperto)"
  )),
  content      text NOT NULL,
  -- Source & confidence
  source       text,                 -- 'user_explicit' | 'inferred' | 'feedback_loop'
  confidence   numeric(3,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  -- Lifecycle
  enabled      boolean DEFAULT true,
  hits_count   int DEFAULT 0,
  last_used_at timestamptz,
  expires_at   timestamptz,           -- nullable: memory permanenti
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_recall
  ON public.ai_persona_memory (company_id, persona_key, hits_count DESC, last_used_at DESC NULLS LAST)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_user
  ON public.ai_persona_memory (user_id, persona_key)
  WHERE user_id IS NOT NULL AND enabled = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_ai_persona_memory_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ai_persona_memory_updated_at ON public.ai_persona_memory;
CREATE TRIGGER trg_ai_persona_memory_updated_at
  BEFORE UPDATE ON public.ai_persona_memory
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_persona_memory_updated_at();

-- ─── 2) RLS multi-tenant ────────────────────────────────────────────────────
ALTER TABLE public.ai_persona_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_persona_memory_company_read ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_company_read ON public.ai_persona_memory
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS ai_persona_memory_user_manage ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_user_manage ON public.ai_persona_memory
  FOR ALL TO authenticated
  USING (
    company_id = public.get_effective_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (
    company_id = public.get_effective_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS ai_persona_memory_service_all ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_service_all ON public.ai_persona_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ai_persona_memory_super_admin ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_super_admin ON public.ai_persona_memory
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── 3) RPC recall: ritorna top-N memory per persona+user ───────────────────
CREATE OR REPLACE FUNCTION public.recall_persona_memory(
  p_company_id uuid,
  p_persona_key text,
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  memory_type text,
  content text,
  hits_count int,
  source text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.memory_type, m.content, m.hits_count, m.source
  FROM public.ai_persona_memory m
  WHERE m.company_id = p_company_id
    AND m.persona_key = p_persona_key
    AND m.enabled = true
    AND (m.expires_at IS NULL OR m.expires_at > now())
    -- Memory user-specific OR global (user_id IS NULL = applica a tutti gli utenti della company)
    AND (m.user_id IS NULL OR p_user_id IS NULL OR m.user_id = p_user_id)
  ORDER BY m.hits_count DESC, m.last_used_at DESC NULLS LAST, m.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_persona_memory(uuid, text, uuid, int) TO authenticated, service_role;

-- ─── 4) RPC record: insert/upsert memory ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_persona_memory(
  p_company_id uuid,
  p_user_id uuid,
  p_persona_key text,
  p_memory_type text,
  p_content text,
  p_source text DEFAULT 'inferred',
  p_confidence numeric DEFAULT 0.7
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  -- Dedup soft: stesso (company, persona, user, content trim+lower) → bump hits
  SELECT id INTO v_existing_id
  FROM public.ai_persona_memory
  WHERE company_id = p_company_id
    AND persona_key = p_persona_key
    AND COALESCE(user_id::text, '') = COALESCE(p_user_id::text, '')
    AND lower(trim(content)) = lower(trim(p_content))
    AND enabled = true
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.ai_persona_memory
    SET hits_count = hits_count + 1,
        last_used_at = now(),
        confidence = GREATEST(confidence, p_confidence)
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.ai_persona_memory (
    company_id, user_id, persona_key, memory_type, content,
    source, confidence, hits_count, last_used_at, created_by
  ) VALUES (
    p_company_id, p_user_id, p_persona_key, p_memory_type, p_content,
    p_source, p_confidence, 1, now(), p_user_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_persona_memory(uuid, uuid, text, text, text, text, numeric)
  TO authenticated, service_role;

-- ─── 5) RPC bump_memory_hit per usage tracking ──────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_persona_memory_hit(p_memory_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ai_persona_memory
  SET hits_count = hits_count + 1, last_used_at = now()
  WHERE id = p_memory_id;
$$;

GRANT EXECUTE ON FUNCTION public.bump_persona_memory_hit(uuid) TO service_role;

COMMIT;
