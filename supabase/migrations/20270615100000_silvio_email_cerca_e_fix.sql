-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · STEP 1 email — "Silvio vede la posta"
-- ────────────────────────────────────────────────────────────────────────────
-- FIX: silvio_tool_lista_email_thread controllava l'esistenza della tabella
--      `email_messages` (che NON esiste) e rispondeva SEMPRE
--      "Modulo email non attivo per questa azienda", anche con caselle attive e
--      migliaia di email. La inbox reale è public.email_inbox.
-- NEW: silvio_tool_cerca_email — ricerca per mittente/fornitore + parole chiave
--      (oggetto/testo/sintesi) in un periodo. Read-only.
--
-- Sicurezza: SECURITY DEFINER con scoping ESPLICITO per p_company_id (impostato
-- dall'edge function dopo l'auth, come gli altri silvio_tool_*). Nessuna azione:
-- entrambe sono di sola lettura. Snippet limitati per privacy/token.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) FIX — lista ultime email ricevute (stessa firma, sorgente corretta)
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_email_thread(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 7,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days  int := GREATEST(1, LEAST(90,  COALESCE(p_days_back, 7)));
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 20)));
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('count', 0, 'threads', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
           'count', COUNT(*),
           'threads', COALESCE(jsonb_agg(jsonb_build_object(
             'id', id,
             'oggetto', subject,
             'da_email', from_email,
             'da_nome', from_name,
             'ricevuta_il', received_at,
             'letta', is_read,
             'categoria', ai_category,
             'sintesi', left(COALESCE(ai_summary, raw_text), 200)
           ) ORDER BY received_at DESC), '[]'::jsonb)
         )
    INTO v_result
  FROM (
    SELECT id, subject, from_email, from_name, received_at, is_read, ai_category, ai_summary, raw_text
      FROM public.email_inbox
     WHERE company_id = p_company_id
       AND received_at >= now() - (v_days || ' days')::interval
       AND COALESCE(is_trashed, false) = false
       AND COALESCE(is_archived, false) = false
     ORDER BY received_at DESC
     LIMIT v_limit
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'threads', '[]'::jsonb));
END $$;

-- 2) NEW — ricerca posta per mittente/fornitore + parole chiave + periodo
CREATE OR REPLACE FUNCTION public.silvio_tool_cerca_email(
  p_company_id uuid,
  p_user_id uuid,
  p_mittente text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_days_back int DEFAULT 30,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days  int  := GREATEST(1, LEAST(365, COALESCE(p_days_back, 30)));
  v_limit int  := GREATEST(1, LEAST(100, COALESCE(p_limit, 20)));
  v_mit   text := NULLIF(btrim(COALESCE(p_mittente, '')), '');
  v_q     text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('count', 0, 'emails', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
           'count', COUNT(*),
           'emails', COALESCE(jsonb_agg(jsonb_build_object(
             'id', id,
             'oggetto', subject,
             'da_email', from_email,
             'da_nome', from_name,
             'ricevuta_il', received_at,
             'letta', is_read,
             'categoria', ai_category,
             'priorita', ai_priority,
             'sintesi', left(COALESCE(ai_summary, raw_text), 240)
           ) ORDER BY received_at DESC), '[]'::jsonb)
         )
    INTO v_result
  FROM (
    SELECT id, subject, from_email, from_name, received_at, is_read, ai_category, ai_priority, ai_summary, raw_text
      FROM public.email_inbox
     WHERE company_id = p_company_id
       AND received_at >= now() - (v_days || ' days')::interval
       AND COALESCE(is_trashed, false) = false
       AND (v_mit IS NULL
            OR from_email ILIKE '%' || v_mit || '%'
            OR COALESCE(from_name, '') ILIKE '%' || v_mit || '%')
       AND (v_q IS NULL
            OR subject ILIKE '%' || v_q || '%'
            OR COALESCE(raw_text, '') ILIKE '%' || v_q || '%'
            OR COALESCE(ai_summary, '') ILIKE '%' || v_q || '%')
     ORDER BY received_at DESC
     LIMIT v_limit
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'emails', '[]'::jsonb));
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_tool_lista_email_thread(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_tool_cerca_email(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_email_thread(uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_cerca_email(uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.silvio_tool_cerca_email(uuid, uuid, text, text, integer, integer)
  IS 'Silvio STEP1: ricerca posta in arrivo (email_inbox) per mittente/fornitore + parole chiave + periodo. Read-only, scoped per company.';
