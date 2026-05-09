-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT D — Rating 👍/👎 + memoria persona-specific
-- -----------------------------------------------------------------------
-- 1. RPC silvio_rate_response: Florin clicca thumbs up/down → aggiorna
--    ai_test_runs.user_rating (1=down, 5=up) per il run corrispondente
-- 2. Tabella silvio_persona_memory: memoria personas (Beatrice ricorda
--    "il piano enterprise è €399/mese") → injected nel system prompt
--    quando quella persona viene attivata
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Memoria persona-specific
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_persona_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key TEXT NOT NULL REFERENCES public.silvio_admin_personas(persona_key) ON DELETE CASCADE,
  -- Tipo memoria
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'fact',          -- fatto stabile (es. "ARPU Pro = €127")
    'preference',    -- preferenza Florin (es. "evita aggettivi vaghi")
    'decision',      -- decisione storica (es. "no per piano gratis")
    'pattern',       -- pattern osservato (es. "lead industriali usano linguaggio tecnico")
    'avoid'          -- anti-pattern da evitare
  )),
  content     TEXT NOT NULL,
  -- Source & confidence
  source      TEXT,            -- 'florin_explicit' | 'inferred' | 'feedback_loop'
  confidence  NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
  -- Lifecycle
  enabled     BOOLEAN DEFAULT true,
  hits_count  INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,     -- nullable, alcune memory sono permanenti
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_persona_memory_active
  ON public.silvio_persona_memory (persona_key)
  WHERE enabled = true;

ALTER TABLE public.silvio_persona_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "persona_memory_super" ON public.silvio_persona_memory;
CREATE POLICY "persona_memory_super" ON public.silvio_persona_memory
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "persona_memory_service" ON public.silvio_persona_memory;
CREATE POLICY "persona_memory_service" ON public.silvio_persona_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Helper: get_persona_memory(persona_key) — top N memorie attive
CREATE OR REPLACE FUNCTION public.get_persona_memory(p_persona_key TEXT, p_limit INT DEFAULT 10)
RETURNS TABLE (
  memory_type TEXT,
  content     TEXT,
  source      TEXT,
  hits_count  INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' AND NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.memory_type, m.content, m.source, m.hits_count
  FROM public.silvio_persona_memory m
  WHERE m.persona_key = p_persona_key
    AND m.enabled = true
    AND (m.expires_at IS NULL OR m.expires_at > now())
  ORDER BY m.hits_count DESC, m.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_persona_memory(TEXT, INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC silvio_rate_response — Florin vota una risposta di Silvio
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_rate_response(
  p_message_id UUID,
  p_rating     SMALLINT  -- 1 (👎) | 5 (👍) — semplice 2-state, V1
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg          RECORD;
  v_test_run_id  UUID;
  v_rating       SMALLINT;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_rating NOT IN (1, 2, 3, 4, 5) THEN
    RAISE EXCEPTION 'Rating deve essere tra 1 e 5';
  END IF;
  v_rating := p_rating;

  SELECT id, conversation_id, model_id, created_at, metadata
  INTO v_msg
  FROM public.silvio_admin_messages
  WHERE id = p_message_id;

  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Message non trovato');
  END IF;

  -- Trova il run corrispondente: cerca in ai_test_runs per (user, model, time proximity)
  SELECT id INTO v_test_run_id
  FROM public.ai_test_runs
  WHERE user_id = (SELECT user_id FROM public.silvio_admin_messages WHERE id = p_message_id)
    AND feature = 'silvio_admin_chat'
    AND model_id = v_msg.model_id
    AND created_at BETWEEN v_msg.created_at - interval '10 seconds'
                       AND v_msg.created_at + interval '10 seconds'
  ORDER BY abs(extract(epoch from created_at - v_msg.created_at))
  LIMIT 1;

  IF v_test_run_id IS NOT NULL THEN
    UPDATE public.ai_test_runs
    SET user_rating = v_rating
    WHERE id = v_test_run_id;
  END IF;

  -- Aggiorna anche metadata in silvio_admin_messages per UI (rating mostrato dopo refresh)
  UPDATE public.silvio_admin_messages
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('user_rating', v_rating, 'rated_at', now())
  WHERE id = p_message_id;

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', p_message_id,
    'rating', v_rating,
    'test_run_updated', v_test_run_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_rate_response(UUID, SMALLINT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Trigger updated_at
-- ───────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_persona_memory_updated_at ON public.silvio_persona_memory;
CREATE TRIGGER trg_persona_memory_updated_at
  BEFORE UPDATE ON public.silvio_persona_memory
  FOR EACH ROW EXECUTE FUNCTION public.fn_silvio_updated_at();

COMMIT;
