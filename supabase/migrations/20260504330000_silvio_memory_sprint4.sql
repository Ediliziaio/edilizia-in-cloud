-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-12 — SPRINT 4: Memory long-term auto-extract
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Estendi silvio_user_preferences con last_memory_extract_at
-- 2. RPC silvio_record_memory_summary (idempotente per period)
-- 3. RPC silvio_get_memory_context (carica facts + summaries recenti)
-- 4. Indici facts per fast lookup
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.silvio_user_preferences
  ADD COLUMN IF NOT EXISTS last_memory_extract_at timestamptz,
  ADD COLUMN IF NOT EXISTS memory_facts_count int NOT NULL DEFAULT 0;

ALTER TABLE public.ai_brain_facts
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS hits_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_brain_facts_company_confidence
  ON public.ai_brain_facts(company_id, confidence DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: silvio_record_memory_summary — upsert sintesi periodica
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_record_memory_summary(
  p_company_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_channel_id uuid,
  p_period_start date,
  p_period_end date,
  p_summary text,
  p_topics text[] DEFAULT NULL,
  p_key_facts jsonb DEFAULT '[]'::jsonb,
  p_messages_count int DEFAULT 0,
  p_embedding vector(1536) DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Idempotenza: replace summary per stesso (user, period_end)
  DELETE FROM public.ai_brain_chat_summaries
   WHERE user_id = p_user_id
     AND period_end = p_period_end
     AND COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_channel_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.ai_brain_chat_summaries
    (company_id, user_id, session_id, channel_id, period_start, period_end,
     summary, topics, key_facts, messages_count, embedding)
  VALUES
    (p_company_id, p_user_id, p_session_id, p_channel_id, p_period_start, p_period_end,
     p_summary, p_topics, COALESCE(p_key_facts, '[]'::jsonb), p_messages_count, p_embedding)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_record_memory_summary(uuid, uuid, uuid, uuid, date, date, text, text[], jsonb, int, vector) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_record_memory_summary(uuid, uuid, uuid, uuid, date, date, text, text[], jsonb, int, vector) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: silvio_get_memory_context — facts + recent summaries per init chat
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_memory_context(
  p_company_id uuid,
  p_user_id uuid,
  p_max_summaries int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facts jsonb;
  v_summaries jsonb;
BEGIN
  -- Top facts azienda (priority by confidence + recency)
  SELECT jsonb_agg(jsonb_build_object(
    'key', fact_key,
    'value', fact_value,
    'confidence', confidence,
    'source', source
  ) ORDER BY confidence DESC, updated_at DESC) INTO v_facts
  FROM public.ai_brain_facts
  WHERE company_id = p_company_id
    AND confidence >= 0.5;

  -- Top N summaries recenti (per questo utente)
  SELECT jsonb_agg(jsonb_build_object(
    'period', jsonb_build_object('start', period_start, 'end', period_end),
    'summary', summary,
    'topics', topics,
    'key_facts', key_facts
  ) ORDER BY period_end DESC) INTO v_summaries
  FROM (
    SELECT * FROM public.ai_brain_chat_summaries
    WHERE user_id = p_user_id
    ORDER BY period_end DESC
    LIMIT GREATEST(LEAST(p_max_summaries, 10), 1)
  ) x;

  RETURN jsonb_build_object(
    'facts', COALESCE(v_facts, '[]'::jsonb),
    'recent_summaries', COALESCE(v_summaries, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_get_memory_context(uuid, uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_get_memory_context(uuid, uuid, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: silvio_users_needing_extraction — utenti con chat fresche
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_users_needing_memory_extract(
  p_lookback_hours int DEFAULT 24,
  p_min_messages int DEFAULT 4
)
RETURNS TABLE (
  user_id uuid,
  company_id uuid,
  channel_id uuid,
  messages_count bigint,
  last_message_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    icm.user_id,
    icm.company_id,
    c.id AS channel_id,
    count(m.id) AS messages_count,
    max(m.created_at) AS last_message_at
  FROM public.internal_chat_channels c
  JOIN public.internal_chat_members icm ON icm.channel_id = c.id
  JOIN public.internal_chat_messages m ON m.channel_id = c.id
  LEFT JOIN public.silvio_user_preferences sp ON sp.user_id = icm.user_id
  WHERE c.name = 'silvio-ai'
    AND c.is_dm = true
    AND m.created_at > now() - (p_lookback_hours || ' hours')::interval
    AND (sp.last_memory_extract_at IS NULL
         OR sp.last_memory_extract_at < m.created_at)
  GROUP BY icm.user_id, icm.company_id, c.id
  HAVING count(m.id) >= p_min_messages;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_users_needing_memory_extract(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_users_needing_memory_extract(int, int) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: silvio_get_chat_for_extraction — prendi messaggi da analizzare
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_chat_for_extraction(
  p_user_id uuid,
  p_channel_id uuid,
  p_lookback_hours int DEFAULT 24
)
RETURNS TABLE (
  role text,
  content text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_silvio_id uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN m.sender_id = v_silvio_id THEN 'assistant' ELSE 'user' END AS role,
    m.content,
    m.created_at
  FROM public.internal_chat_messages m
  WHERE m.channel_id = p_channel_id
    AND m.created_at > now() - (p_lookback_hours || ' hours')::interval
    AND m.message_type = 'text'
  ORDER BY m.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_get_chat_for_extraction(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_get_chat_for_extraction(uuid, uuid, int) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: silvio_mark_extracted — segna utente come processato
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_mark_memory_extracted(
  p_user_id uuid,
  p_company_id uuid,
  p_facts_added int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.silvio_user_preferences
    (user_id, company_id, last_memory_extract_at, memory_facts_count)
  VALUES
    (p_user_id, p_company_id, now(), p_facts_added)
  ON CONFLICT (user_id) DO UPDATE SET
    last_memory_extract_at = EXCLUDED.last_memory_extract_at,
    memory_facts_count = public.silvio_user_preferences.memory_facts_count + EXCLUDED.memory_facts_count,
    company_id = COALESCE(EXCLUDED.company_id, public.silvio_user_preferences.company_id),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_mark_memory_extracted(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_mark_memory_extracted(uuid, uuid, int) TO service_role;
