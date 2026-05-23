-- Email personal client scaling
-- Server-side thread pagination, folder counters and text-search indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_received_thread
  ON public.email_inbox(user_id, received_at DESC, thread_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_folder_account_received
  ON public.email_inbox(user_id, mailbox_folder, oauth_connection_id, received_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_unread_received
  ON public.email_inbox(user_id, is_read, received_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_subject_trgm
  ON public.email_inbox USING gin (subject gin_trgm_ops)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_from_email_trgm
  ON public.email_inbox USING gin (from_email gin_trgm_ops)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_from_name_trgm
  ON public.email_inbox USING gin (from_name gin_trgm_ops)
  WHERE user_id IS NOT NULL AND from_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_raw_text_trgm
  ON public.email_inbox USING gin (raw_text gin_trgm_ops)
  WHERE user_id IS NOT NULL AND raw_text IS NOT NULL;

CREATE OR REPLACE FUNCTION public.email_folder_counts(p_account_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  folder_key text,
  oauth_connection_id uuid,
  total integer,
  unread integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      i.oauth_connection_id,
      CASE
        WHEN i.is_trashed = true OR i.mailbox_folder = 'trash' THEN 'trash'
        WHEN i.status = 'spam' OR i.mailbox_folder = 'spam' THEN 'spam'
        WHEN i.is_archived = true OR i.mailbox_folder = 'archive' THEN 'archive'
        WHEN i.mailbox_folder = 'sent' THEN 'sent'
        ELSE 'inbox'
      END AS folder_key,
      i.is_read
    FROM public.email_inbox i
    WHERE i.user_id = auth.uid()
      AND (p_account_ids IS NULL OR i.oauth_connection_id = ANY(p_account_ids))

    UNION ALL

    SELECT
      i.oauth_connection_id,
      'starred'::text AS folder_key,
      i.is_read
    FROM public.email_inbox i
    WHERE i.user_id = auth.uid()
      AND i.is_starred = true
      AND COALESCE(i.is_trashed, false) = false
      AND (p_account_ids IS NULL OR i.oauth_connection_id = ANY(p_account_ids))

    UNION ALL

    SELECT
      o.oauth_connection_id,
      'drafts'::text AS folder_key,
      true AS is_read
    FROM public.email_outbox o
    WHERE o.user_id = auth.uid()
      AND o.status = 'draft'
      AND (p_account_ids IS NULL OR o.oauth_connection_id = ANY(p_account_ids))
  )
  SELECT
    b.folder_key,
    CASE WHEN GROUPING(b.oauth_connection_id) = 1 THEN NULL ELSE b.oauth_connection_id END AS oauth_connection_id,
    COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE b.is_read = false)::integer AS unread
  FROM base b
  GROUP BY GROUPING SETS ((b.folder_key), (b.folder_key, b.oauth_connection_id));
$$;

REVOKE ALL ON FUNCTION public.email_folder_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_folder_counts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.email_list_threads(
  p_folder text DEFAULT 'inbox',
  p_account_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search_text text DEFAULT NULL,
  p_from text DEFAULT NULL,
  p_to text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_has_attachment boolean DEFAULT false,
  p_has_star boolean DEFAULT false,
  p_is_unread boolean DEFAULT false,
  p_before timestamptz DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  subject_normalized text,
  last_subject text,
  last_from_email text,
  last_from_name text,
  participants text[],
  message_count integer,
  unread_count integer,
  has_starred boolean,
  has_attachments boolean,
  last_received_at timestamptz,
  preview text,
  ai_category text,
  ai_priority text,
  total_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS safe_limit,
      GREATEST(COALESCE(p_offset, 0), 0) AS safe_offset,
      NULLIF(BTRIM(p_search_text), '') AS search_text,
      NULLIF(BTRIM(p_from), '') AS from_text,
      NULLIF(BTRIM(p_to), '') AS to_text,
      NULLIF(BTRIM(p_subject), '') AS subject_text
  ),
  filtered AS (
    SELECT i.*
    FROM public.email_inbox i, params p
    WHERE i.user_id = auth.uid()
      AND i.thread_id IS NOT NULL
      AND (p_account_id IS NULL OR i.oauth_connection_id = p_account_id)
      AND (
        CASE COALESCE(p_folder, 'inbox')
          WHEN 'inbox' THEN i.mailbox_folder = 'inbox'
            AND COALESCE(i.is_archived, false) = false
            AND COALESCE(i.is_trashed, false) = false
            AND COALESCE(i.status, 'new') <> 'spam'
          WHEN 'sent' THEN i.mailbox_folder = 'sent'
          WHEN 'starred' THEN COALESCE(i.is_starred, false) = true
            AND COALESCE(i.is_trashed, false) = false
          WHEN 'spam' THEN i.mailbox_folder = 'spam' OR i.status = 'spam'
          WHEN 'trash' THEN COALESCE(i.is_trashed, false) = true OR i.mailbox_folder = 'trash'
          WHEN 'archive' THEN (COALESCE(i.is_archived, false) = true OR i.mailbox_folder = 'archive')
            AND COALESCE(i.is_trashed, false) = false
          ELSE true
        END
      )
      AND (
        p_category IS NULL
        OR (p_category = 'priority' AND i.ai_priority IN ('alta', 'high'))
        OR (p_category = 'lead' AND i.ai_category IN ('lead', 'lead_new', 'lead_followup'))
        OR (p_category = 'quote' AND i.ai_category IN ('quote_request', 'preventivo', 'richiesta_preventivo'))
        OR (p_category = 'customer' AND i.ai_category IN ('cliente_esistente', 'customer'))
        OR (p_category = 'supplier' AND i.ai_category IN ('fornitore', 'supplier', 'ddt'))
        OR (p_category = 'invoice' AND i.ai_category IN ('fattura', 'invoice'))
        OR (p_category = 'admin' AND i.ai_category IN ('pratica_amministrativa', 'admin', 'documento_amministrativo'))
        OR (p_category = 'support' AND i.ai_category IN ('support', 'assistenza', 'ticket'))
        OR (p_category = 'spam' AND i.ai_category = 'spam')
        OR (p_category = 'other' AND i.ai_category IN ('altro', 'other'))
      )
      AND (p.from_text IS NULL OR i.from_email ILIKE '%' || p.from_text || '%' OR i.from_name ILIKE '%' || p.from_text || '%')
      AND (p.to_text IS NULL OR i.to_email ILIKE '%' || p.to_text || '%' OR array_to_string(COALESCE(i.cc_emails, '{}'::text[]), ' ') ILIKE '%' || p.to_text || '%')
      AND (p.subject_text IS NULL OR i.subject ILIKE '%' || p.subject_text || '%')
      AND (
        p.search_text IS NULL
        OR i.subject ILIKE '%' || p.search_text || '%'
        OR i.from_email ILIKE '%' || p.search_text || '%'
        OR i.from_name ILIKE '%' || p.search_text || '%'
        OR i.raw_text ILIKE '%' || p.search_text || '%'
      )
      AND (p_has_attachment = false OR jsonb_array_length(COALESCE(i.attachments, '[]'::jsonb)) > 0)
      AND (p_has_star = false OR COALESCE(i.is_starred, false) = true)
      AND (p_is_unread = false OR COALESCE(i.is_read, true) = false)
      AND (p_before IS NULL OR i.received_at < p_before)
      AND (p_after IS NULL OR i.received_at > p_after)
  ),
  grouped AS (
    SELECT
      f.thread_id AS id,
      COALESCE((array_agg(f.subject ORDER BY f.received_at DESC))[1], '') AS subject_normalized,
      (array_agg(f.subject ORDER BY f.received_at DESC))[1] AS last_subject,
      (array_agg(f.from_email ORDER BY f.received_at DESC))[1] AS last_from_email,
      (array_agg(f.from_name ORDER BY f.received_at DESC))[1] AS last_from_name,
      array_remove(array_agg(DISTINCT COALESCE(f.from_name, f.from_email)), NULL)::text[] AS participants,
      COUNT(*)::integer AS message_count,
      COUNT(*) FILTER (WHERE COALESCE(f.is_read, true) = false)::integer AS unread_count,
      BOOL_OR(COALESCE(f.is_starred, false)) AS has_starred,
      BOOL_OR(jsonb_array_length(COALESCE(f.attachments, '[]'::jsonb)) > 0) AS has_attachments,
      MAX(f.received_at) AS last_received_at,
      LEFT((array_agg(f.raw_text ORDER BY f.received_at DESC))[1], 200) AS preview,
      (array_remove(array_agg(f.ai_category ORDER BY f.received_at DESC), NULL))[1] AS ai_category,
      CASE
        WHEN BOOL_OR(f.ai_priority IN ('alta', 'high')) THEN 'alta'
        WHEN BOOL_OR(f.ai_priority IN ('media', 'medium')) THEN 'media'
        WHEN BOOL_OR(f.ai_priority IN ('bassa', 'low')) THEN 'bassa'
        ELSE (array_remove(array_agg(f.ai_priority ORDER BY f.received_at DESC), NULL))[1]
      END AS ai_priority
    FROM filtered f
    GROUP BY f.thread_id
  ),
  counted AS (
    SELECT g.*, COUNT(*) OVER ()::integer AS total_count
    FROM grouped g
  ),
  ranked AS (
    SELECT
      c.*,
      ROW_NUMBER() OVER (ORDER BY c.last_received_at DESC NULLS LAST) AS row_index
    FROM counted c
  )
  SELECT
    c.id,
    c.subject_normalized,
    c.last_subject,
    c.last_from_email,
    c.last_from_name,
    c.participants,
    c.message_count,
    c.unread_count,
    c.has_starred,
    c.has_attachments,
    c.last_received_at,
    c.preview,
    c.ai_category,
    c.ai_priority,
    c.total_count
  FROM ranked c, params p
  WHERE c.row_index > p.safe_offset
    AND c.row_index <= (p.safe_offset + p.safe_limit)
  ORDER BY c.last_received_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.email_list_threads(
  text, uuid, text, text, text, text, text, boolean, boolean, boolean, timestamptz, timestamptz, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_list_threads(
  text, uuid, text, text, text, text, text, boolean, boolean, boolean, timestamptz, timestamptz, integer, integer
) TO authenticated;
