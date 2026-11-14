-- Fase 4 (14/11/2026): nel preventivo e nel computo il cliente si cerca anche per partita IVA.
-- `get_customers_paginated` cercava in nome, cognome, ragione sociale, email, telefono, codice
-- fiscale e città, non nella partita IVA, e non la restituiva: scelto un cliente-azienda dal popup
-- «Seleziona cliente», la P.IVA non arrivava nel documento.
-- Cambia solo la funzione (CREATE OR REPLACE, stessa firma, stessi permessi): istantanea.
-- «IT01234567890» trova «01234567890» e viceversa; gli spazi nel numero non contano.
CREATE OR REPLACE FUNCTION public.get_customers_paginated(p_company_id uuid, p_search text DEFAULT NULL::text, p_salesperson_id uuid DEFAULT NULL::uuid, p_salesperson_none boolean DEFAULT false, p_has_orders text DEFAULT 'all'::text, p_sort_field text DEFAULT 'name'::text, p_sort_dir text DEFAULT 'asc'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_has_phone text DEFAULT 'all'::text, p_has_fiscal_code text DEFAULT 'all'::text, p_has_site_address text DEFAULT 'all'::text, p_portal_state text DEFAULT 'all'::text, p_customer_type text DEFAULT 'all'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  v_assegnati uuid[];
  -- La partita IVA cercata: senza «IT» davanti e senza spazi, se è un numero.
  v_piva text := CASE WHEN p_search ~* '^\s*(IT)?[\s0-9]{6,}\s*$'
                      THEN regexp_replace(regexp_replace(p_search, '^\s*IT', '', 'i'), '\s', '', 'g') END;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF NOT public.puo_vedere_clienti(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato: serve il permesso sui clienti' USING ERRCODE = '42501';
  END IF;
  v_assegnati := public.clienti_solo_assegnati(p_company_id);

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
      p.vat_number,
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
      COALESCE(p.customer_type, 'privato') AS customer_type,
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
      AND (v_assegnati IS NULL OR p.id = ANY(v_assegnati))
      -- Clienti e committenti sono due elenchi distinti: 'all' resta il
      -- comportamento storico per chi non passa il parametro.
      AND (
        p_customer_type IS NULL OR p_customer_type = 'all'
        OR COALESCE(p.customer_type, 'privato') = p_customer_type
      )
      AND (
        p_search IS NULL OR p_search = '' OR
        p.first_name ILIKE '%' || p_search || '%' OR
        p.last_name ILIKE '%' || p_search || '%' OR
        p.business_name ILIKE '%' || p_search || '%' OR
        p.email ILIKE '%' || p_search || '%' OR
        p.phone ILIKE '%' || p_search || '%' OR
        p.fiscal_code ILIKE '%' || p_search || '%' OR
        p.vat_number ILIKE '%' || p_search || '%' OR
        (v_piva IS NOT NULL AND regexp_replace(COALESCE(p.vat_number, ''), '^\s*IT|\s', '', 'gi') LIKE '%' || v_piva || '%') OR
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
$function$;

REVOKE ALL ON FUNCTION public.get_customers_paginated(uuid, text, uuid, boolean, text, text, text, integer, integer, timestamptz, timestamptz, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customers_paginated(uuid, text, uuid, boolean, text, text, text, integer, integer, timestamptz, timestamptz, text, text, text, text, text) TO authenticated, service_role;
