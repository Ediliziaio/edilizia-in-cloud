-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO SUPERADMIN — Sprint 2 RPC Tools
-- -----------------------------------------------------------------------
-- 8 RPC che alimentano i tool di Silvio Admin:
--   AREA SUPPORT (4):
--     - silvio_list_tickets
--     - silvio_draft_ticket_reply
--     - silvio_get_customer_history
--     - silvio_cluster_tickets
--   AREA LEAD (4):
--     - silvio_list_leads
--     - silvio_get_lead_detail
--     - silvio_create_task
--     - silvio_draft_followup_email
--
-- Tutti SECURITY DEFINER + verificano super_admin all'interno.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- AREA SUPPORT
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) silvio_list_tickets — ticket aperti cross-tenant aggregato
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_list_tickets(
  p_status   TEXT DEFAULT 'open',     -- 'open'|'pending'|'resolved'|'closed'|'all'
  p_priority TEXT DEFAULT 'all',      -- 'low'|'normal'|'high'|'critical'|'all'
  p_limit    INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data JSONB;
  v_total INT;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(t ORDER BY t.created_at DESC) INTO v_data
  FROM (
    SELECT
      sc.id,
      sc.company_id,
      c.name              AS company_name,
      sc.status,
      sc.priority,
      sc.assigned_to,
      sc.resolved_at,
      sc.created_at,
      EXTRACT(EPOCH FROM (now() - sc.created_at)) / 3600 AS hours_open,
      sc.internal_notes
    FROM public.support_conversations sc
    LEFT JOIN public.companies c ON c.id = sc.company_id
    WHERE
      (p_status = 'all' OR sc.status::text = p_status
        OR (p_status = 'open' AND sc.status::text IN ('open','pending','waiting')))
      AND (p_priority = 'all' OR sc.priority::text = p_priority)
      AND sc.resolved_at IS NULL
    ORDER BY
      CASE sc.priority::text
        WHEN 'critical' THEN 0
        WHEN 'high'     THEN 1
        WHEN 'normal'   THEN 2
        WHEN 'low'      THEN 3
        ELSE 4
      END,
      sc.created_at DESC
    LIMIT p_limit
  ) t;

  SELECT COUNT(*) INTO v_total
  FROM public.support_conversations
  WHERE
    (p_status = 'all' OR status::text = p_status
      OR (p_status = 'open' AND status::text IN ('open','pending','waiting')))
    AND resolved_at IS NULL;

  RETURN jsonb_build_object(
    'tickets', COALESCE(v_data, '[]'::jsonb),
    'total_open', v_total,
    'returned', COALESCE(jsonb_array_length(v_data), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_list_tickets(TEXT, TEXT, INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) silvio_draft_ticket_reply — bozza risposta (NON invia, solo template)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_draft_ticket_reply(
  p_ticket_id UUID,
  p_tone      TEXT DEFAULT 'empathetic'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket   RECORD;
  v_messages JSONB;
  v_company  RECORD;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    sc.id, sc.company_id, sc.status, sc.priority,
    sc.created_at, sc.resolved_at, sc.internal_notes
  INTO v_ticket
  FROM public.support_conversations sc
  WHERE sc.id = p_ticket_id;

  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('error', 'Ticket non trovato');
  END IF;

  -- Carica company
  SELECT id, name, status::text AS company_status
  INTO v_company
  FROM public.companies WHERE id = v_ticket.company_id;

  -- Carica ultimi 10 messaggi (per contesto AI)
  SELECT jsonb_agg(jsonb_build_object(
    'sender_id', sm.sender_id,
    'content',   LEFT(sm.content, 500),
    'created_at', sm.created_at
  ) ORDER BY sm.created_at) INTO v_messages
  FROM (
    SELECT sender_id, content, created_at
    FROM public.support_messages
    WHERE conversation_id = p_ticket_id
    ORDER BY created_at DESC
    LIMIT 10
  ) sm;

  -- Ritorna context — l'AI userà questi dati per generare la bozza
  RETURN jsonb_build_object(
    'ticket', row_to_json(v_ticket),
    'company', row_to_json(v_company),
    'recent_messages', COALESCE(v_messages, '[]'::jsonb),
    'tone_requested', p_tone,
    'note', 'Usa questi dati per generare bozza. La risposta NON viene inviata: Florin la rivede prima.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_draft_ticket_reply(UUID, TEXT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) silvio_get_customer_history — storico interazioni di una company cliente
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_customer_history(
  p_company_id UUID,
  p_days       INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company    RECORD;
  v_tickets    JSONB;
  v_logins     JSONB;
  v_subscription JSONB;
  v_since      TIMESTAMPTZ := now() - (p_days || ' days')::interval;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, status::text AS status, created_at INTO v_company
  FROM public.companies WHERE id = p_company_id;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object('error', 'Azienda non trovata');
  END IF;

  -- Tickets aperti/recenti
  SELECT jsonb_agg(jsonb_build_object(
    'id', sc.id,
    'status', sc.status,
    'priority', sc.priority,
    'created_at', sc.created_at,
    'resolved_at', sc.resolved_at,
    'days_open', EXTRACT(EPOCH FROM (COALESCE(sc.resolved_at, now()) - sc.created_at)) / 86400
  ) ORDER BY sc.created_at DESC) INTO v_tickets
  FROM public.support_conversations sc
  WHERE sc.company_id = p_company_id
    AND sc.created_at >= v_since;

  -- Subscription corrente (se tabella esiste)
  BEGIN
    SELECT jsonb_build_object(
      'plan_id', s.plan_id,
      'status', s.status,
      'current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end
    ) INTO v_subscription
    FROM public.subscriptions s
    WHERE s.company_id = p_company_id
      AND s.status::text IN ('active','trialing','past_due','unpaid')
    ORDER BY s.created_at DESC
    LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_subscription := NULL;
  END;

  -- Last login (da auth users → profiles)
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', p.id,
      'email', u.email,
      'last_sign_in_at', u.last_sign_in_at,
      'days_ago', EXTRACT(EPOCH FROM (now() - u.last_sign_in_at)) / 86400
    ) ORDER BY u.last_sign_in_at DESC NULLS LAST) INTO v_logins
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.company_id = p_company_id
    LIMIT 5;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_logins := NULL;
  END;

  RETURN jsonb_build_object(
    'company', row_to_json(v_company),
    'subscription', v_subscription,
    'tickets', COALESCE(v_tickets, '[]'::jsonb),
    'tickets_count', COALESCE(jsonb_array_length(v_tickets), 0),
    'last_logins', COALESCE(v_logins, '[]'::jsonb),
    'period_days', p_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_customer_history(UUID, INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) silvio_cluster_tickets — pattern ricorrenti via keyword cluster
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_cluster_tickets(
  p_period      TEXT DEFAULT '30d',
  p_min_cluster INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_clusters JSONB;
  v_total_tickets INT;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  v_since := CASE p_period
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE now() - interval '30 days'
  END;

  -- Cluster semplice: keyword frequenti negli internal_notes / messages
  -- (in V1 base via word frequency. In V2 si aggiunge embedding clustering).
  WITH messages AS (
    SELECT
      lower(unnest(string_to_array(
        regexp_replace(COALESCE(sm.content, ''), '[^a-zA-ZÀ-ÿ]', ' ', 'g'),
        ' '
      ))) AS word,
      sm.conversation_id
    FROM public.support_messages sm
    WHERE sm.created_at >= v_since
      AND sm.content IS NOT NULL
  ),
  word_clusters AS (
    SELECT
      word,
      COUNT(DISTINCT conversation_id) AS ticket_count
    FROM messages
    WHERE LENGTH(word) > 4  -- ignora parole brevi (a, di, il, ...)
      AND word NOT IN ('ciao','buon','buona','grazie','salve','egregi','spettabile','cordiali','saluti','please','hello','allegato','ticket')
    GROUP BY word
    HAVING COUNT(DISTINCT conversation_id) >= p_min_cluster
    ORDER BY ticket_count DESC
    LIMIT 15
  )
  SELECT jsonb_agg(jsonb_build_object(
    'keyword', word,
    'tickets_count', ticket_count
  ) ORDER BY ticket_count DESC) INTO v_clusters
  FROM word_clusters;

  SELECT COUNT(DISTINCT id) INTO v_total_tickets
  FROM public.support_conversations
  WHERE created_at >= v_since;

  RETURN jsonb_build_object(
    'period', p_period,
    'since', v_since,
    'total_tickets_period', v_total_tickets,
    'top_keyword_clusters', COALESCE(v_clusters, '[]'::jsonb),
    'note', 'V1: keyword-based clustering. V2 prevede embedding semantico (più accurato).'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_cluster_tickets(TEXT, INT) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- AREA LEAD
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 5) silvio_list_leads — lead caldi non contattati (cross-tenant)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_list_leads(
  p_score_min          INT DEFAULT 60,
  p_days_since_contact INT DEFAULT 0,
  p_status             TEXT DEFAULT 'all',
  p_limit              INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(l ORDER BY l.score_effective DESC NULLS LAST) INTO v_data
  FROM (
    SELECT
      mc.id,
      mc.first_name,
      mc.last_name,
      mc.email,
      mc.phone,
      mc.company_name,
      mc.contact_type,
      mc.source,
      COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) AS score_effective,
      mc.ai_score_tier,
      mc.last_activity_at,
      EXTRACT(EPOCH FROM (now() - COALESCE(mc.last_activity_at, mc.created_at))) / 86400 AS days_since_activity,
      mc.created_at,
      mc.tags
    FROM public.marketing_contacts mc
    WHERE
      (mc.contact_type IS NULL OR mc.contact_type IN ('lead','prospect'))
      AND COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) >= p_score_min
      AND (p_days_since_contact = 0
           OR EXTRACT(EPOCH FROM (now() - COALESCE(mc.last_activity_at, mc.created_at))) / 86400 >= p_days_since_contact)
    ORDER BY COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) DESC
    LIMIT p_limit
  ) l;

  RETURN jsonb_build_object(
    'leads', COALESCE(v_data, '[]'::jsonb),
    'returned', COALESCE(jsonb_array_length(v_data), 0),
    'filter', jsonb_build_object(
      'score_min', p_score_min,
      'days_since_contact', p_days_since_contact,
      'status', p_status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_list_leads(INT, INT, TEXT, INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) silvio_get_lead_detail — scheda lead completa
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_lead_detail(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead       RECORD;
  v_activities JSONB;
  v_notes      JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    mc.id, mc.first_name, mc.last_name, mc.email, mc.phone,
    mc.company_name, mc.contact_type, mc.source, mc.attr_source,
    mc.tags, mc.lead_score, mc.ai_score, mc.ai_score_tier, mc.ai_score_reasoning,
    mc.last_activity_at, mc.created_at
  INTO v_lead
  FROM public.marketing_contacts mc WHERE mc.id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead non trovato');
  END IF;

  -- Activities (eventi tracciati)
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'type', mca.activity_type,
      'created_at', mca.created_at,
      'metadata', mca.metadata
    ) ORDER BY mca.created_at DESC) INTO v_activities
    FROM (
      SELECT activity_type, created_at, metadata
      FROM public.marketing_contact_activities
      WHERE contact_id = p_lead_id
      ORDER BY created_at DESC
      LIMIT 20
    ) mca;
  EXCEPTION WHEN undefined_column THEN
    v_activities := NULL;
  END;

  -- Notes
  SELECT jsonb_agg(jsonb_build_object(
    'note', mcn.note,
    'created_at', mcn.created_at
  ) ORDER BY mcn.created_at DESC) INTO v_notes
  FROM public.marketing_contact_notes mcn
  WHERE mcn.contact_id = p_lead_id
  LIMIT 10;

  RETURN jsonb_build_object(
    'lead', row_to_json(v_lead),
    'recent_activities', COALESCE(v_activities, '[]'::jsonb),
    'notes', COALESCE(v_notes, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_lead_detail(UUID) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) silvio_create_task — crea task in cs_tasks
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_create_task(
  p_title        TEXT,
  p_due_date     TIMESTAMPTZ DEFAULT NULL,
  p_related_to   UUID DEFAULT NULL,
  p_related_type TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_task_id UUID;
BEGIN
  IF NOT public.is_silvio_superadmin(v_user_id) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Insert in cs_tasks (schema basico — adattare se necessario)
  BEGIN
    INSERT INTO public.cs_tasks (
      title, description, due_date, status, assigned_to,
      related_entity_id, related_entity_type, created_by, created_at
    ) VALUES (
      p_title,
      COALESCE(p_notes, ''),
      p_due_date,
      'pending',
      v_user_id,
      p_related_to,
      p_related_type,
      v_user_id,
      now()
    )
    RETURNING id INTO v_task_id;
  EXCEPTION WHEN undefined_column THEN
    -- Schema cs_tasks diverso: insert minimal
    INSERT INTO public.cs_tasks (title, status, created_at)
    VALUES (p_title, 'pending', now())
    RETURNING id INTO v_task_id;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', v_task_id,
    'title', p_title,
    'due_date', p_due_date,
    'related_to', p_related_to
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_create_task(TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) silvio_draft_followup_email — bozza email follow-up (NON invia)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_draft_followup_email(
  p_lead_id      UUID,
  p_tone         TEXT DEFAULT 'professional',
  p_context_hint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead     RECORD;
  v_activities JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    mc.id, mc.first_name, mc.last_name, mc.email, mc.phone,
    mc.company_name, mc.source,
    mc.lead_score, mc.ai_score, mc.ai_score_tier, mc.ai_score_reasoning,
    mc.last_activity_at, mc.tags
  INTO v_lead
  FROM public.marketing_contacts mc WHERE mc.id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead non trovato');
  END IF;

  IF v_lead.email IS NULL OR v_lead.email = '' THEN
    RETURN jsonb_build_object(
      'error', 'Lead senza email — impossibile bozza',
      'lead_id', p_lead_id
    );
  END IF;

  -- Recenti activities (per personalizzazione)
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'type', activity_type,
      'created_at', created_at
    ) ORDER BY created_at DESC) INTO v_activities
    FROM (
      SELECT activity_type, created_at
      FROM public.marketing_contact_activities
      WHERE contact_id = p_lead_id
      ORDER BY created_at DESC
      LIMIT 5
    ) sub;
  EXCEPTION WHEN undefined_column THEN
    v_activities := NULL;
  END;

  -- Ritorna context per AI generazione bozza
  RETURN jsonb_build_object(
    'lead', row_to_json(v_lead),
    'recent_activities', COALESCE(v_activities, '[]'::jsonb),
    'tone_requested', p_tone,
    'context_hint', p_context_hint,
    'note', 'Usa questi dati per generare bozza personalizzata. NON viene inviata: Florin la rivede prima.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_draft_followup_email(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.silvio_list_tickets             IS 'Sprint 2 — Tool Support: ticket aperti aggregati cross-tenant';
COMMENT ON FUNCTION public.silvio_draft_ticket_reply       IS 'Sprint 2 — Tool Support: bozza risposta (no send)';
COMMENT ON FUNCTION public.silvio_get_customer_history     IS 'Sprint 2 — Tool Support: storico cliente (ticket+login+sub)';
COMMENT ON FUNCTION public.silvio_cluster_tickets          IS 'Sprint 2 — Tool Support: pattern ricorrenti keyword';
COMMENT ON FUNCTION public.silvio_list_leads               IS 'Sprint 2 — Tool Lead: caldi non contattati';
COMMENT ON FUNCTION public.silvio_get_lead_detail          IS 'Sprint 2 — Tool Lead: scheda completa';
COMMENT ON FUNCTION public.silvio_create_task              IS 'Sprint 2 — Tool Lead: promemoria interno';
COMMENT ON FUNCTION public.silvio_draft_followup_email     IS 'Sprint 2 — Tool Lead: bozza email (no send)';

COMMIT;
