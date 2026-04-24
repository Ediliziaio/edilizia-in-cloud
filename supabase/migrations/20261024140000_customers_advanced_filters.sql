-- Filtri avanzati + bucket import AI per area /azienda/clienti:
--   1. Estensione RPC get_customers_paginated con: date_from/to,
--      has_phone, has_fiscal_code, has_site_address, portal_disabled
--   2. Storage bucket "contacts-tmp" per caricare documenti (PDF, Excel,
--      immagini) che l'AI estrae in anagrafica clienti.
--   3. Bulk helper RPC per assegnare venditore in bulk mantenendo RLS.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. RPC get_customers_paginated — aggiunta filtri avanzati
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customers_paginated(
  p_company_id UUID,
  p_search TEXT DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_salesperson_none BOOLEAN DEFAULT FALSE,
  p_has_orders TEXT DEFAULT 'all',
  p_sort_field TEXT DEFAULT 'name',
  p_sort_dir TEXT DEFAULT 'asc',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 25,
  -- Nuovi parametri opzionali (default NULL = nessun filtro)
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_has_phone TEXT DEFAULT 'all',           -- 'all' | 'yes' | 'no'
  p_has_fiscal_code TEXT DEFAULT 'all',     -- 'all' | 'yes' | 'no'
  p_has_site_address TEXT DEFAULT 'all',    -- 'all' | 'yes' | 'no'
  p_portal_state TEXT DEFAULT 'all'         -- 'all' | 'active' | 'disabled'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  WITH customer_base AS (
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.email,
      p.phone,
      p.fiscal_code,
      p.address,
      p.site_address,
      p.notes,
      p.created_at,
      p.salesperson_id,
      COALESCE(p.portal_disabled, FALSE) AS portal_disabled,
      COALESCE(oc.order_count, 0)::int AS order_count
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
    LEFT JOIN (
      SELECT customer_id, COUNT(*)::int AS order_count
      FROM public.orders
      WHERE company_id = p_company_id
      GROUP BY customer_id
    ) oc ON oc.customer_id = p.id
    WHERE p.company_id = p_company_id
      -- Search filter
      AND (
        p_search IS NULL OR p_search = '' OR
        p.first_name ILIKE '%' || p_search || '%' OR
        p.last_name ILIKE '%' || p_search || '%' OR
        p.email ILIKE '%' || p_search || '%' OR
        p.phone ILIKE '%' || p_search || '%' OR
        p.fiscal_code ILIKE '%' || p_search || '%'
      )
      -- Salesperson filter
      AND (
        (p_salesperson_id IS NULL AND p_salesperson_none = FALSE)
        OR (p_salesperson_none = TRUE AND p.salesperson_id IS NULL)
        OR (p_salesperson_id IS NOT NULL AND p.salesperson_id = p_salesperson_id)
      )
      -- Orders filter
      AND (
        p_has_orders = 'all'
        OR (p_has_orders = 'with' AND COALESCE(oc.order_count, 0) > 0)
        OR (p_has_orders = 'without' AND COALESCE(oc.order_count, 0) = 0)
      )
      -- Date range filter
      AND (p_date_from IS NULL OR p.created_at >= p_date_from)
      AND (p_date_to IS NULL OR p.created_at <= p_date_to)
      -- Has phone
      AND (
        p_has_phone = 'all'
        OR (p_has_phone = 'yes' AND COALESCE(TRIM(p.phone), '') <> '')
        OR (p_has_phone = 'no'  AND COALESCE(TRIM(p.phone), '') = '')
      )
      -- Has fiscal code
      AND (
        p_has_fiscal_code = 'all'
        OR (p_has_fiscal_code = 'yes' AND COALESCE(TRIM(p.fiscal_code), '') <> '')
        OR (p_has_fiscal_code = 'no'  AND COALESCE(TRIM(p.fiscal_code), '') = '')
      )
      -- Has site address
      AND (
        p_has_site_address = 'all'
        OR (p_has_site_address = 'yes' AND COALESCE(TRIM(p.site_address), '') <> '')
        OR (p_has_site_address = 'no'  AND COALESCE(TRIM(p.site_address), '') = '')
      )
      -- Portal state
      AND (
        p_portal_state = 'all'
        OR (p_portal_state = 'active'   AND COALESCE(p.portal_disabled, FALSE) = FALSE)
        OR (p_portal_state = 'disabled' AND COALESCE(p.portal_disabled, FALSE) = TRUE)
      )
  ),
  total AS (
    SELECT COUNT(*)::int AS total_count FROM customer_base
  )
  SELECT json_build_object(
    'rows', COALESCE((
      SELECT json_agg(row_data)
      FROM (
        SELECT cb.*
        FROM customer_base cb
        ORDER BY
          CASE WHEN p_sort_field = 'name' AND p_sort_dir = 'asc' THEN cb.first_name || ' ' || cb.last_name END ASC,
          CASE WHEN p_sort_field = 'name' AND p_sort_dir = 'desc' THEN cb.first_name || ' ' || cb.last_name END DESC,
          CASE WHEN p_sort_field = 'created_at' AND p_sort_dir = 'asc' THEN cb.created_at END ASC,
          CASE WHEN p_sort_field = 'created_at' AND p_sort_dir = 'desc' THEN cb.created_at END DESC,
          CASE WHEN p_sort_field = 'orders' AND p_sort_dir = 'asc' THEN cb.order_count END ASC,
          CASE WHEN p_sort_field = 'orders' AND p_sort_dir = 'desc' THEN cb.order_count END DESC
        LIMIT p_limit
        OFFSET p_offset
      ) row_data
    ), '[]'::json),
    'total_count', (SELECT total_count FROM total)
  ) INTO result;

  RETURN result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Bulk helper — assegna venditore a più clienti in una call
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_assign_salesperson(
  p_company_id UUID,
  p_customer_ids UUID[],
  p_salesperson_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Solo profili della stessa company (RLS invoker-side + filtro)
  UPDATE public.profiles
    SET salesperson_id = p_salesperson_id,
        updated_at = now()
    WHERE company_id = p_company_id
      AND id = ANY(p_customer_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_assign_salesperson(UUID, UUID[], UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 3. Storage bucket "contacts-tmp" — import AI di anagrafica clienti
-- ────────────────────────────────────────────────────────────────────
-- PDF, Excel, immagini → accepted. Size limit 20MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contacts-tmp',
  'contacts-tmp',
  FALSE,
  20971520,  -- 20MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: path convention = "<user_id>/..." (user può gestire solo il proprio scope)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='contacts_tmp_insert'
  ) THEN
    CREATE POLICY contacts_tmp_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'contacts-tmp'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='contacts_tmp_select'
  ) THEN
    CREATE POLICY contacts_tmp_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'contacts-tmp'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='contacts_tmp_delete'
  ) THEN
    CREATE POLICY contacts_tmp_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'contacts-tmp'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  END IF;
END $$;

COMMIT;
