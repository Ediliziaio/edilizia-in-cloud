-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.email_search_recipients(
  p_query text,
  p_company_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  email text,
  display_name text,
  source text,
  source_label text,
  last_used_at timestamptz,
  hit_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_q := lower(trim(coalesce(p_query, '')));
  IF length(v_q) < 2 THEN RETURN; END IF;
  v_q := replace(replace(v_q, '%', '\%'), '_', '\_');
  v_q := '%' || v_q || '%';

  RETURN QUERY
  WITH
  src_anagrafiche AS (
    SELECT
      lower(p.email) AS email,
      coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), p.email) AS display_name,
      CASE
        WHEN ur.role = 'customer' THEN 'contact_client'
        WHEN p.is_business THEN 'contact_supplier'
        ELSE 'contact'
      END AS source,
      CASE
        WHEN ur.role = 'customer' THEN 'Cliente'
        WHEN p.is_business THEN 'Anagrafica'
        ELSE 'Contatto'
      END AS source_label,
      p.updated_at AS last_used_at,
      1 AS hit_count
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.company_id = p_company_id
      AND p.email IS NOT NULL
      AND p.email != ''
      AND (lower(p.email) LIKE v_q
        OR lower(coalesce(p.first_name, '')) LIKE v_q
        OR lower(coalesce(p.last_name, '')) LIKE v_q
        OR lower(coalesce(p.business_name, '')) LIKE v_q)
  ),
  src_inbox_to AS (
    SELECT lower(i.from_email) AS email, i.from_name AS display_name,
           'inbox_history' AS source, 'Mittente passato' AS source_label,
           max(i.received_at) AS last_used_at, count(*)::int AS hit_count
    FROM public.email_inbox i
    WHERE i.user_id = v_uid
      AND i.from_email IS NOT NULL
      AND lower(i.from_email) LIKE v_q
    GROUP BY lower(i.from_email), i.from_name
  ),
  src_inbox_cc AS (
    SELECT lower(cc.addr) AS email, NULL::text AS display_name,
           'inbox_history' AS source, 'Visto in CC' AS source_label,
           max(i.received_at) AS last_used_at, count(*)::int AS hit_count
    FROM public.email_inbox i,
         LATERAL unnest(i.cc_emails) AS cc(addr)
    WHERE i.user_id = v_uid
      AND cc.addr IS NOT NULL
      AND lower(cc.addr) LIKE v_q
    GROUP BY lower(cc.addr)
  ),
  src_outbox_to AS (
    SELECT lower(addr) AS email, NULL::text AS display_name,
           'outbox_history' AS source, 'Già inviato' AS source_label,
           max(o.created_at) AS last_used_at, count(*)::int AS hit_count
    FROM public.email_outbox o,
         LATERAL unnest(o.to_emails) AS t(addr)
    WHERE o.user_id = v_uid
      AND o.status IN ('sent', 'queued', 'sending')
      AND lower(addr) LIKE v_q
    GROUP BY lower(addr)
  ),
  src_outbox_cc AS (
    SELECT lower(addr) AS email, NULL::text AS display_name,
           'outbox_history' AS source, 'Inviato in CC' AS source_label,
           max(o.created_at) AS last_used_at, count(*)::int AS hit_count
    FROM public.email_outbox o,
         LATERAL unnest(o.cc_emails) AS t(addr)
    WHERE o.user_id = v_uid
      AND o.status IN ('sent', 'queued', 'sending')
      AND lower(addr) LIKE v_q
    GROUP BY lower(addr)
  ),
  src_outbox_bcc AS (
    SELECT lower(addr) AS email, NULL::text AS display_name,
           'outbox_history' AS source, 'Inviato in CCN' AS source_label,
           max(o.created_at) AS last_used_at, count(*)::int AS hit_count
    FROM public.email_outbox o,
         LATERAL unnest(o.bcc_emails) AS t(addr)
    WHERE o.user_id = v_uid
      AND o.status IN ('sent', 'queued', 'sending')
      AND lower(addr) LIKE v_q
    GROUP BY lower(addr)
  ),
  unioned AS (
    SELECT * FROM src_anagrafiche
    UNION ALL SELECT * FROM src_inbox_to
    UNION ALL SELECT * FROM src_inbox_cc
    UNION ALL SELECT * FROM src_outbox_to
    UNION ALL SELECT * FROM src_outbox_cc
    UNION ALL SELECT * FROM src_outbox_bcc
  ),
  ranked AS (
    SELECT
      u.email, u.display_name, u.source, u.source_label, u.last_used_at, u.hit_count,
      ROW_NUMBER() OVER (
        PARTITION BY u.email
        ORDER BY
          CASE u.source
            WHEN 'contact_client' THEN 1
            WHEN 'contact_supplier' THEN 2
            WHEN 'contact' THEN 3
            WHEN 'outbox_history' THEN 4
            WHEN 'inbox_history' THEN 5
            ELSE 6
          END,
          u.last_used_at DESC NULLS LAST
      ) AS rn
    FROM unioned u
    WHERE u.email IS NOT NULL AND u.email != ''
  )
  SELECT r.email, r.display_name, r.source, r.source_label, r.last_used_at, r.hit_count
  FROM ranked r
  WHERE r.rn = 1
  ORDER BY
    CASE r.source
      WHEN 'contact_client' THEN 1
      WHEN 'contact_supplier' THEN 2
      WHEN 'contact' THEN 3
      WHEN 'outbox_history' THEN 4
      WHEN 'inbox_history' THEN 5
      ELSE 6
    END,
    r.last_used_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_search_recipients(text, uuid, int) TO authenticated;

COMMENT ON FUNCTION public.email_search_recipients(text, uuid, int) IS
  'Cerca destinatari da anagrafiche + inbox (from/cc) + outbox (to/cc/bcc). Aggiornato 2026-05-27 per cc/bcc.';
