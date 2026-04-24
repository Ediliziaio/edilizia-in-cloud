-- Estende profiles per supportare:
--  1. Clienti AZIENDA (ragione sociale) oltre a persona fisica
--  2. Indirizzo strutturato (via, città, CAP, provincia, stato)
--  3. Stessi campi per l'indirizzo di cantiere

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. Tipo cliente: persona fisica vs azienda
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS business_name TEXT;

COMMENT ON COLUMN public.profiles.is_business IS
  'Se TRUE il cliente è una persona giuridica (azienda). business_name obbligatorio, first_name/last_name opzionali (referente).';
COMMENT ON COLUMN public.profiles.business_name IS
  'Ragione sociale (richiesta quando is_business=true). Max 200.';

-- ────────────────────────────────────────────────────────────────────
-- 2. Indirizzo strutturato (residenza / sede legale)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'IT';

COMMENT ON COLUMN public.profiles.city IS 'Città (indirizzo residenza / sede legale).';
COMMENT ON COLUMN public.profiles.postal_code IS 'CAP (5 cifre in Italia, variabile all''estero).';
COMMENT ON COLUMN public.profiles.province IS 'Sigla provincia (es. TO, MI).';
COMMENT ON COLUMN public.profiles.country IS 'ISO code paese (default IT).';

-- ────────────────────────────────────────────────────────────────────
-- 3. Indirizzo strutturato cantiere
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS site_city TEXT,
  ADD COLUMN IF NOT EXISTS site_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS site_province TEXT;

-- ────────────────────────────────────────────────────────────────────
-- 4. Constraint: se is_business → business_name non vuoto
-- ────────────────────────────────────────────────────────────────────
-- Nota: usiamo un DO-block per evitare errore se il constraint esiste già.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_business_name_required'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_business_name_required
      CHECK (is_business = FALSE OR (business_name IS NOT NULL AND length(trim(business_name)) > 0));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 5. Helper RPC: display_name aware di is_business
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profile_display_name(p_profile public.profiles)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_profile.is_business AND p_profile.business_name IS NOT NULL AND trim(p_profile.business_name) <> ''
      THEN trim(p_profile.business_name)
    ELSE NULLIF(trim(
      coalesce(NULLIF(trim(p_profile.first_name), '—'), '') || ' ' ||
      coalesce(NULLIF(trim(p_profile.last_name), '—'), '')
    ), '')
  END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6. Update RPC get_customers_paginated: include business_name in ricerca
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
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_has_phone TEXT DEFAULT 'all',
  p_has_fiscal_code TEXT DEFAULT 'all',
  p_has_site_address TEXT DEFAULT 'all',
  p_portal_state TEXT DEFAULT 'all'
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
      p.is_business,
      p.business_name,
      p.email,
      p.phone,
      p.fiscal_code,
      p.address,
      p.city,
      p.postal_code,
      p.province,
      p.site_address,
      p.site_city,
      p.site_postal_code,
      p.site_province,
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
      AND (
        p_search IS NULL OR p_search = '' OR
        p.first_name ILIKE '%' || p_search || '%' OR
        p.last_name ILIKE '%' || p_search || '%' OR
        p.business_name ILIKE '%' || p_search || '%' OR
        p.email ILIKE '%' || p_search || '%' OR
        p.phone ILIKE '%' || p_search || '%' OR
        p.fiscal_code ILIKE '%' || p_search || '%' OR
        p.city ILIKE '%' || p_search || '%'
      )
      AND (
        (p_salesperson_id IS NULL AND p_salesperson_none = FALSE)
        OR (p_salesperson_none = TRUE AND p.salesperson_id IS NULL)
        OR (p_salesperson_id IS NOT NULL AND p.salesperson_id = p_salesperson_id)
      )
      AND (
        p_has_orders = 'all'
        OR (p_has_orders = 'with' AND COALESCE(oc.order_count, 0) > 0)
        OR (p_has_orders = 'without' AND COALESCE(oc.order_count, 0) = 0)
      )
      AND (p_date_from IS NULL OR p.created_at >= p_date_from)
      AND (p_date_to IS NULL OR p.created_at <= p_date_to)
      AND (
        p_has_phone = 'all'
        OR (p_has_phone = 'yes' AND COALESCE(TRIM(p.phone), '') <> '')
        OR (p_has_phone = 'no'  AND COALESCE(TRIM(p.phone), '') = '')
      )
      AND (
        p_has_fiscal_code = 'all'
        OR (p_has_fiscal_code = 'yes' AND COALESCE(TRIM(p.fiscal_code), '') <> '')
        OR (p_has_fiscal_code = 'no'  AND COALESCE(TRIM(p.fiscal_code), '') = '')
      )
      AND (
        p_has_site_address = 'all'
        OR (p_has_site_address = 'yes' AND COALESCE(TRIM(p.site_address), '') <> '')
        OR (p_has_site_address = 'no'  AND COALESCE(TRIM(p.site_address), '') = '')
      )
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
          CASE WHEN p_sort_field = 'name' AND p_sort_dir = 'asc' THEN
            COALESCE(NULLIF(cb.business_name, ''), cb.last_name || ' ' || cb.first_name) END ASC,
          CASE WHEN p_sort_field = 'name' AND p_sort_dir = 'desc' THEN
            COALESCE(NULLIF(cb.business_name, ''), cb.last_name || ' ' || cb.first_name) END DESC,
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

COMMIT;
