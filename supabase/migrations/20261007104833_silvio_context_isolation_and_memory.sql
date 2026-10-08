-- Local-only hardening. No change to existing business data.
-- Explicit actor: service-role requests must not silently acquire admin access.
CREATE OR REPLACE FUNCTION public.silvio_context_actor_roles(p_company_id uuid, p_user_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_roles text[]; v_home uuid; v_blocked boolean;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'Actor and company required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.ai_is_service_role() AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT company_id, is_blocked INTO v_home, v_blocked FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND OR COALESCE(v_blocked, false) THEN
    RAISE EXCEPTION 'Actor unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT role), ARRAY[]::text[]) INTO v_roles FROM (
    SELECT r.role::text AS role FROM public.user_roles r
      WHERE r.user_id = p_user_id AND (v_home = p_company_id OR r.role::text = 'super_admin')
    UNION
    SELECT m.access_role::text FROM public.multi_company_access m
      WHERE m.user_id = p_user_id AND m.company_id = p_company_id AND m.status = 'active'
        AND (m.expires_at IS NULL OR m.expires_at > now())
  ) roles;
  IF cardinality(v_roles) = 0 THEN
    RAISE EXCEPTION 'Company access denied' USING ERRCODE = '42501';
  END IF;
  RETURN v_roles;
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_context_actor_roles(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_context_actor_roles(uuid, uuid) TO service_role;

-- One retrieval entrypoint for pre-RAG AND search_brain. Existing free-text
-- documents have no column-level ACL: restricted staff must use structured tools.
CREATE OR REPLACE FUNCTION public.silvio_match_brain(
  p_company_id uuid, p_user_id uuid, p_query_embedding vector,
  p_match_count int DEFAULT 6, p_min_similarity numeric DEFAULT 0.30,
  p_source_types text[] DEFAULT NULL, p_scope text DEFAULT NULL,
  p_kb_areas text[] DEFAULT NULL
)
RETURNS TABLE(id uuid, scope text, source_type text, source_id uuid,
  title text, category text, content text, metadata jsonb, similarity numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_roles text[];
BEGIN
  IF p_company_id IS NULL AND p_scope = 'universal' THEN
    -- Evaluation console: a verified platform administrator may have no home company.
    IF p_user_id IS NULL OR (NOT public.ai_is_service_role() AND auth.uid() IS DISTINCT FROM p_user_id)
      OR NOT EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
        WHERE p.id = p_user_id AND NOT COALESCE(p.is_blocked, false) AND r.role::text = 'super_admin') THEN
      RAISE EXCEPTION 'Universal evaluation access denied' USING ERRCODE = '42501';
    END IF;
    v_roles := ARRAY['super_admin']::text[];
  ELSE
    v_roles := public.silvio_context_actor_roles(p_company_id, p_user_id);
  END IF;
  RETURN QUERY SELECT d.id, d.scope, d.source_type, d.source_id,
    d.title, d.category, d.content,
    COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'chunk_id', d.chunk_id, 'last_verified_at', d.last_verified_at,
      'valid_until', d.valid_until, 'area', COALESCE(d.metadata->>'area', d.category)),
    (1 - (d.embedding <=> p_query_embedding))::numeric
  FROM public.ai_brain_documents d
  WHERE d.deleted_at IS NULL AND d.embedding IS NOT NULL
    AND (d.valid_until IS NULL OR d.valid_until > now())
    AND (p_scope IS NULL OR d.scope = p_scope)
    AND (p_source_types IS NULL OR d.source_type = ANY(p_source_types))
    AND (
      (d.scope = 'universal' AND (p_kb_areas IS NULL OR COALESCE(d.metadata->>'area', d.category) = ANY(p_kb_areas)))
      OR (d.scope = 'company' AND d.company_id = p_company_id
        AND v_roles && ARRAY['super_admin', 'company_admin']::text[]
        AND (d.visibility_roles IS NULL OR d.visibility_roles && v_roles)
        AND (d.source_type <> 'chat_summary' OR d.metadata->>'user_id' = p_user_id::text))
    )
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding, d.id
  LIMIT LEAST(GREATEST(COALESCE(p_match_count, 6), 1), 20);
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_match_brain(uuid, uuid, vector, int, numeric, text[], text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_match_brain(uuid, uuid, vector, int, numeric, text[], text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_get_memory_context(
  p_company_id uuid, p_user_id uuid, p_max_summaries int DEFAULT 5
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_roles text[]; v_facts jsonb; v_summaries jsonb;
BEGIN
  v_roles := public.silvio_context_actor_roles(p_company_id, p_user_id);
  -- Historic summaries/facts can contain figures whose permission was revoked.
  -- No free-text fallback for restricted roles; current data comes from tools.
  IF NOT (v_roles && ARRAY['super_admin', 'company_admin']::text[]) THEN
    RETURN jsonb_build_object('facts', '[]'::jsonb, 'recent_summaries', '[]'::jsonb);
  END IF;
  SELECT jsonb_agg(jsonb_build_object('key', fact_key, 'value', fact_value,
    'confidence', confidence, 'source', source, 'hit_count', hit_count,
    'last_used_at', last_used_at) ORDER BY confidence DESC, updated_at DESC)
    INTO v_facts FROM (
      SELECT * FROM public.ai_brain_facts
      WHERE company_id = p_company_id AND enabled AND confidence >= 0.5
        AND (source NOT IN ('auto_chat', 'chat') OR source_user_id = p_user_id)
      ORDER BY confidence DESC, updated_at DESC LIMIT 20
    ) facts;
  SELECT jsonb_agg(jsonb_build_object(
    'period', jsonb_build_object('start', period_start, 'end', period_end),
    'summary', summary, 'topics', topics, 'key_facts', key_facts) ORDER BY period_end DESC)
    INTO v_summaries FROM (
      SELECT * FROM public.ai_brain_chat_summaries
      WHERE company_id = p_company_id AND user_id = p_user_id
      ORDER BY period_end DESC, created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_max_summaries, 5), 1), 10)
    ) summaries;
  RETURN jsonb_build_object('facts', COALESCE(v_facts, '[]'::jsonb),
    'recent_summaries', COALESCE(v_summaries, '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_get_memory_context(uuid, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_get_memory_context(uuid, uuid, int) TO authenticated, service_role;

-- Prevent direct authenticated callers bypassing the scoped Edge entrypoint.
-- Legacy service-only consumers remain compatible; migrate them separately.
REVOKE ALL ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[], boolean, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_brain(uuid, vector, int, numeric, text[], boolean, text[]) TO service_role;

CREATE INDEX IF NOT EXISTS idx_silvio_summaries_tenant_actor_period
  ON public.ai_brain_chat_summaries(company_id, user_id, period_end DESC);

-- Durable cursor per tenant + actor + channel, independent from prompt history.
CREATE TABLE IF NOT EXISTS public.silvio_memory_checkpoints (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.internal_chat_channels(id) ON DELETE CASCADE,
  processed_through timestamptz,
  processed_message_id uuid,
  processed_offset int NOT NULL DEFAULT 0 CHECK (processed_offset >= 0),
  lease_id uuid, lease_until timestamptz,
  PRIMARY KEY (company_id, user_id, channel_id)
);
ALTER TABLE public.silvio_memory_checkpoints ADD COLUMN IF NOT EXISTS processed_offset int NOT NULL DEFAULT 0 CHECK (processed_offset >= 0);
ALTER TABLE public.silvio_memory_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.silvio_memory_checkpoints FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.silvio_memory_checkpoints TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_claim_memory_batch(
  p_company_id uuid, p_user_id uuid, p_channel_id uuid, p_min_messages int DEFAULT 8
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_state public.silvio_memory_checkpoints; v_count int; v_lease uuid;
BEGIN
  PERFORM public.silvio_context_actor_roles(p_company_id, p_user_id);
  IF NOT EXISTS (SELECT 1 FROM public.internal_chat_channels c
    JOIN public.internal_chat_members m ON m.channel_id = c.id
    WHERE c.id = p_channel_id AND c.company_id = p_company_id AND c.name = 'silvio-ai'
      AND c.is_dm AND m.user_id = p_user_id AND m.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Memory channel access denied' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.silvio_memory_checkpoints(company_id, user_id, channel_id)
    VALUES (p_company_id, p_user_id, p_channel_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.silvio_memory_checkpoints
    WHERE company_id = p_company_id AND user_id = p_user_id AND channel_id = p_channel_id FOR UPDATE;
  IF v_state.lease_until > now() THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.internal_chat_messages m WHERE m.channel_id = p_channel_id
      AND m.company_id = p_company_id AND m.message_type = 'text'
      AND ((m.created_at, m.id) > (COALESCE(v_state.processed_through, '-infinity'::timestamptz),
        COALESCE(v_state.processed_message_id, '00000000-0000-0000-0000-000000000000'::uuid))
        OR (v_state.processed_offset > 0 AND m.id = v_state.processed_message_id))
      LIMIT 8
  ) fresh;
  IF v_state.processed_offset = 0 AND v_count < LEAST(GREATEST(p_min_messages, 1), 8) THEN RETURN NULL; END IF;
  v_lease := gen_random_uuid();
  UPDATE public.silvio_memory_checkpoints SET lease_id = v_lease, lease_until = now() + interval '10 minutes'
    WHERE company_id = p_company_id AND user_id = p_user_id AND channel_id = p_channel_id;
  RETURN jsonb_build_object('lease_id', v_lease, 'processed_through', v_state.processed_through,
    'processed_message_id', v_state.processed_message_id, 'processed_offset', v_state.processed_offset);
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_claim_memory_batch(uuid, uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_claim_memory_batch(uuid, uuid, uuid, int) TO service_role;

ALTER TABLE public.ai_brain_chat_summaries ADD COLUMN IF NOT EXISTS batch_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_silvio_summary_batch
  ON public.ai_brain_chat_summaries(company_id, user_id, channel_id, batch_key);
CREATE OR REPLACE FUNCTION public.silvio_record_memory_batch(
  p_company_id uuid, p_user_id uuid, p_channel_id uuid, p_batch_key text,
  p_period_start date, p_period_end date, p_summary text, p_topics text[],
  p_key_facts jsonb, p_messages_count int, p_embedding vector
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_batch_key IS NULL OR p_channel_id IS NULL THEN
    RAISE EXCEPTION 'Batch and channel required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ai_brain_chat_summaries(company_id, user_id, channel_id, batch_key,
    period_start, period_end, summary, topics, key_facts, messages_count, embedding)
  VALUES (p_company_id, p_user_id, p_channel_id, p_batch_key, p_period_start, p_period_end,
    p_summary, p_topics, p_key_facts, p_messages_count, p_embedding)
  ON CONFLICT (company_id, user_id, channel_id, batch_key) DO UPDATE
    SET summary = EXCLUDED.summary, topics = EXCLUDED.topics, key_facts = EXCLUDED.key_facts,
      embedding = EXCLUDED.embedding
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_record_memory_batch(uuid, uuid, uuid, text, date, date, text, text[], jsonb, int, vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_record_memory_batch(uuid, uuid, uuid, text, date, date, text, text[], jsonb, int, vector) TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_users_needing_memory_extract(
  p_lookback_hours int DEFAULT 24, p_min_messages int DEFAULT 4
)
RETURNS TABLE(user_id uuid, company_id uuid, channel_id uuid, messages_count bigint, last_message_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT cm.user_id, c.company_id, c.id, count(m.id), max(m.created_at)
    FROM public.internal_chat_channels c
    JOIN public.internal_chat_members cm ON cm.channel_id = c.id AND cm.company_id = c.company_id
    JOIN public.internal_chat_messages m ON m.channel_id = c.id AND m.company_id = c.company_id
    LEFT JOIN public.silvio_memory_checkpoints cp ON cp.company_id = c.company_id
      AND cp.user_id = cm.user_id AND cp.channel_id = c.id
    WHERE c.name = 'silvio-ai' AND c.is_dm AND m.message_type = 'text'
      AND cm.user_id <> '00000000-0000-0000-0000-000000000002'::uuid
      AND ((m.created_at, m.id) > (COALESCE(cp.processed_through, '-infinity'::timestamptz),
        COALESCE(cp.processed_message_id, '00000000-0000-0000-0000-000000000000'::uuid))
        OR (cp.processed_offset > 0 AND m.id = cp.processed_message_id))
      AND (cp.lease_until IS NULL OR cp.lease_until <= now())
    GROUP BY cm.user_id, c.company_id, c.id
    HAVING count(m.id) >= GREATEST(p_min_messages, 1) OR bool_or(cp.processed_offset > 0)
    ORDER BY max(m.created_at) LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_users_needing_memory_extract(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_users_needing_memory_extract(int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_recall_persona_memory(
  p_company_id uuid, p_persona_key text, p_user_id uuid, p_limit int DEFAULT 5
)
RETURNS TABLE(id uuid, memory_type text, content text, hits_count int, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_roles text[];
BEGIN
  v_roles := public.silvio_context_actor_roles(p_company_id, p_user_id);
  IF NOT (v_roles && ARRAY['super_admin', 'company_admin']::text[]) THEN RETURN; END IF;
  RETURN QUERY SELECT m.id, m.memory_type, m.content, m.hits_count, m.source
    FROM public.ai_persona_memory m
    WHERE m.company_id = p_company_id AND m.persona_key = p_persona_key
      AND m.enabled AND (m.user_id IS NULL OR m.user_id = p_user_id)
      AND (m.expires_at IS NULL OR m.expires_at > now()) AND m.confidence >= 0.5
      AND COALESCE(m.source, '') NOT IN ('demo_preview', 'demo_coverage')
    ORDER BY m.hits_count DESC, m.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_recall_persona_memory(uuid, text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_recall_persona_memory(uuid, text, uuid, int) TO service_role;
