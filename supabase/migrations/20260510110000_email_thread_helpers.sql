-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT E2 — Helper RPCs per threading + folder seed + read flags
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- email_thread_increment — aggiorna counter di un thread esistente quando
-- arriva un nuovo messaggio
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_thread_increment(
  p_thread_id    UUID,
  p_unread_delta INT DEFAULT 0,
  p_starred      BOOLEAN DEFAULT false,
  p_attach       BOOLEAN DEFAULT false,
  p_received_at  TIMESTAMPTZ DEFAULT now(),
  p_new_participants TEXT[] DEFAULT '{}',
  p_preview      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_participants TEXT[];
  v_merged TEXT[];
BEGIN
  SELECT participants INTO v_current_participants
  FROM public.email_threads WHERE id = p_thread_id;

  IF v_current_participants IS NULL THEN RETURN; END IF;

  -- Merge participants (dedup case-insensitive)
  SELECT ARRAY(
    SELECT DISTINCT lower(unnest)
    FROM unnest(v_current_participants || COALESCE(p_new_participants, '{}'::text[]))
    WHERE unnest IS NOT NULL AND length(unnest) > 0
  ) INTO v_merged;

  UPDATE public.email_threads
  SET
    message_count = message_count + 1,
    unread_count = GREATEST(0, unread_count + p_unread_delta),
    has_starred = has_starred OR p_starred,
    has_attachments = has_attachments OR p_attach,
    last_received_at = GREATEST(last_received_at, p_received_at),
    participants = v_merged,
    preview = COALESCE(p_preview, preview),
    updated_at = now()
  WHERE id = p_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_thread_increment(
  UUID, INT, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TEXT[], TEXT
) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- email_mark_thread_read — marca un thread come letto
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_mark_thread_read(p_thread_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.email_inbox
  SET is_read = true
  WHERE thread_id = p_thread_id
    AND user_id = auth.uid()
    AND is_read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.email_threads
  SET unread_count = 0
  WHERE id = p_thread_id AND user_id = auth.uid();

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_mark_thread_read(UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- email_seed_user_folders — crea cartelle di sistema per un utente alla
-- prima connessione email (idempotente)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_seed_user_folders(p_user_id UUID, p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verifica permesso
  IF auth.uid() <> p_user_id AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.email_folders (company_id, user_id, name, folder_type, color, icon)
  VALUES
    (p_company_id, p_user_id, 'Inbox',     'inbox',     '#3b82f6', 'Inbox'),
    (p_company_id, p_user_id, 'Inviati',   'sent',      '#10b981', 'Send'),
    (p_company_id, p_user_id, 'Bozze',     'drafts',    '#94a3b8', 'FileEdit'),
    (p_company_id, p_user_id, 'Importanti','important', '#f59e0b', 'Star'),
    (p_company_id, p_user_id, 'Spam',      'spam',      '#ef4444', 'ShieldAlert'),
    (p_company_id, p_user_id, 'Cestino',   'trash',     '#64748b', 'Trash2')
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_seed_user_folders(UUID, UUID) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- email_inbox_toggle_flag — toggle is_read/is_starred/is_archived per riga
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_inbox_toggle_flag(
  p_email_id UUID,
  p_flag     TEXT,  -- 'read' | 'starred' | 'archived' | 'trashed'
  p_value    BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id UUID;
  v_was_unread BOOLEAN;
BEGIN
  IF p_flag NOT IN ('read', 'starred', 'archived', 'trashed') THEN
    RAISE EXCEPTION 'Flag non valido' USING ERRCODE = '22023';
  END IF;

  -- Verifica ownership
  SELECT thread_id, NOT is_read INTO v_thread_id, v_was_unread
  FROM public.email_inbox
  WHERE id = p_email_id AND user_id = auth.uid();

  IF v_thread_id IS NULL AND NOT FOUND THEN
    RETURN false;
  END IF;

  -- Update flag
  IF p_flag = 'read' THEN
    UPDATE public.email_inbox SET is_read = p_value WHERE id = p_email_id;
    -- Aggiorna unread_count thread
    IF v_thread_id IS NOT NULL AND v_was_unread <> NOT p_value THEN
      UPDATE public.email_threads
      SET unread_count = GREATEST(0, unread_count + (CASE WHEN p_value THEN -1 ELSE 1 END))
      WHERE id = v_thread_id;
    END IF;
  ELSIF p_flag = 'starred' THEN
    UPDATE public.email_inbox SET is_starred = p_value WHERE id = p_email_id;
    IF v_thread_id IS NOT NULL THEN
      UPDATE public.email_threads
      SET has_starred = (
        SELECT bool_or(is_starred) FROM public.email_inbox WHERE thread_id = v_thread_id
      )
      WHERE id = v_thread_id;
    END IF;
  ELSIF p_flag = 'archived' THEN
    UPDATE public.email_inbox SET is_archived = p_value WHERE id = p_email_id;
  ELSIF p_flag = 'trashed' THEN
    UPDATE public.email_inbox SET is_trashed = p_value WHERE id = p_email_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_inbox_toggle_flag(UUID, TEXT, BOOLEAN) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- View v_my_email_threads — thread visibili all'utente corrente
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_my_email_threads AS
SELECT
  t.id,
  t.user_id,
  t.company_id,
  t.subject_normalized,
  t.participants,
  t.message_count,
  t.unread_count,
  t.has_starred,
  t.has_attachments,
  t.first_received_at,
  t.last_received_at,
  t.preview,
  -- Subject originale dell'ultimo messaggio (più "umano" del normalized)
  (
    SELECT subject FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
    ORDER BY received_at DESC LIMIT 1
  ) AS last_subject,
  -- From dell'ultimo messaggio
  (
    SELECT from_email FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
    ORDER BY received_at DESC LIMIT 1
  ) AS last_from_email,
  (
    SELECT from_name FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
    ORDER BY received_at DESC LIMIT 1
  ) AS last_from_name
FROM public.email_threads t
WHERE t.user_id = auth.uid();

GRANT SELECT ON public.v_my_email_threads TO authenticated;

COMMIT;
