-- ============================================================================
-- AI Persona Memory — tenant hardening
-- ============================================================================
-- Chiude due criticità:
-- 1) RPC SECURITY DEFINER richiamabili con company_id arbitrario.
-- 2) Policy FOR ALL troppo permissiva sulle memorie globali (user_id IS NULL).
-- ============================================================================

BEGIN;

ALTER TABLE public.ai_persona_memory ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_dedupe_v2
  ON public.ai_persona_memory (
    company_id,
    persona_key,
    (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (lower(trim(content)))
  )
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_company_recent_v2
  ON public.ai_persona_memory (company_id, created_at DESC)
  WHERE enabled = true;

DROP POLICY IF EXISTS ai_persona_memory_company_read ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_user_manage ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_service_all ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_super_admin ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_read ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_insert ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_update ON public.ai_persona_memory;
DROP POLICY IF EXISTS ai_persona_memory_delete ON public.ai_persona_memory;

CREATE POLICY ai_persona_memory_read
  ON public.ai_persona_memory
  FOR SELECT TO authenticated
  USING (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id = public.get_effective_company_id()
  );

CREATE POLICY ai_persona_memory_insert
  ON public.ai_persona_memory
  FOR INSERT TO authenticated
  WITH CHECK (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = public.get_effective_company_id()
      AND (
        user_id = auth.uid()
        OR (
          user_id IS NULL
          AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
        )
      )
    )
  );

CREATE POLICY ai_persona_memory_update
  ON public.ai_persona_memory
  FOR UPDATE TO authenticated
  USING (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = public.get_effective_company_id()
      AND (
        user_id = auth.uid()
        OR (
          user_id IS NULL
          AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
        )
      )
    )
  )
  WITH CHECK (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = public.get_effective_company_id()
      AND (
        user_id = auth.uid()
        OR (
          user_id IS NULL
          AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
        )
      )
    )
  );

CREATE POLICY ai_persona_memory_delete
  ON public.ai_persona_memory
  FOR DELETE TO authenticated
  USING (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = public.get_effective_company_id()
      AND (
        user_id = auth.uid()
        OR (
          user_id IS NULL
          AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
        )
      )
    )
  );

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
DECLARE
  v_user_id uuid := p_user_id;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  IF NOT (public.ai_is_service_role() OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'cannot recall memory for another user' USING ERRCODE = '42501';
    END IF;
    v_user_id := auth.uid();
  END IF;

  RETURN QUERY
  SELECT m.id, m.memory_type, m.content, m.hits_count, m.source
  FROM public.ai_persona_memory m
  WHERE m.company_id = p_company_id
    AND m.persona_key = p_persona_key
    AND m.enabled = true
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (m.user_id IS NULL OR (v_user_id IS NOT NULL AND m.user_id = v_user_id))
  ORDER BY m.hits_count DESC, m.last_used_at DESC NULLS LAST, m.created_at DESC
  LIMIT v_limit;
END;
$$;

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
  v_content text := trim(COALESCE(p_content, ''));
  v_confidence numeric := LEAST(GREATEST(COALESCE(p_confidence, 0.7), 0), 1);
  v_created_by uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  IF p_persona_key IS NULL OR trim(p_persona_key) = '' THEN
    RAISE EXCEPTION 'persona_key required' USING ERRCODE = '22023';
  END IF;

  IF p_memory_type NOT IN ('fact', 'preference', 'decision', 'pattern', 'avoid') THEN
    RAISE EXCEPTION 'invalid memory_type' USING ERRCODE = '22023';
  END IF;

  IF length(v_content) < 3 THEN
    RAISE EXCEPTION 'content too short' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.ai_is_service_role() OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    IF p_user_id IS NULL THEN
      IF NOT public.has_role(auth.uid(), 'company_admin'::public.app_role) THEN
        RAISE EXCEPTION 'company admin access required for global memory' USING ERRCODE = '42501';
      END IF;
    ELSIF p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'cannot record memory for another user' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.ai_persona_memory
  WHERE company_id = p_company_id
    AND persona_key = trim(p_persona_key)
    AND COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND lower(trim(content)) = lower(v_content)
    AND enabled = true
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.ai_persona_memory
    SET hits_count = hits_count + 1,
        last_used_at = now(),
        confidence = GREATEST(COALESCE(confidence, 0), v_confidence)
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.ai_persona_memory (
    company_id, user_id, persona_key, memory_type, content,
    source, confidence, hits_count, last_used_at, created_by
  ) VALUES (
    p_company_id, p_user_id, trim(p_persona_key), p_memory_type, v_content,
    COALESCE(NULLIF(trim(COALESCE(p_source, '')), ''), 'inferred'),
    v_confidence, 1, now(), v_created_by
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_persona_memory(uuid, text, uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_persona_memory(uuid, uuid, text, text, text, text, numeric) TO authenticated, service_role;

COMMIT;
