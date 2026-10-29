-- ════════════════════════════════════════════════════════════════════════════
-- Committenti separati dai clienti nell'elenco
-- ════════════════════════════════════════════════════════════════════════════
-- `profiles.customer_type` esiste dal 28/12/2026 ('privato' | 'appaltatore') ma
-- l'elenco non l'ha mai guardato: un committente che ti passa lavori finiva nel
-- mucchio dei clienti finali. `get_customers_paginated` prende un parametro in
-- coda, `p_customer_type`, e restituisce la colonna: la pagina Clienti chiede
-- 'privato', la scheda Committenti chiede 'appaltatore'.
--
-- Il default resta 'all', cioe' il comportamento di prima, per non cambiare
-- niente a chi chiama la funzione senza passarlo.
--
-- La vecchia firma si CANCELLA invece di affiancarla: due sovraccarichi con gli
-- stessi nomi mandano PostgREST in «could not choose the best candidate».
-- I privilegi tornano identici (authenticated + service_role, anon mai).
-- Nessuna riga scritta.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop function if exists public.get_customers_paginated(uuid,text,uuid,boolean,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,text,text,text);

create or replace function public.get_customers_paginated(
  p_company_id uuid,
  p_search text default null,
  p_salesperson_id uuid default null,
  p_salesperson_none boolean default false,
  p_has_orders text default 'all',
  p_sort_field text default 'name',
  p_sort_dir text default 'asc',
  p_offset integer default 0,
  p_limit integer default 25,
  p_date_from timestamp with time zone default null,
  p_date_to timestamp with time zone default null,
  p_has_phone text default 'all',
  p_has_fiscal_code text default 'all',
  p_has_site_address text default 'all',
  p_portal_state text default 'all',
  p_customer_type text default 'all'
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
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

comment on function public.get_customers_paginated(uuid,text,uuid,boolean,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,text,text,text,text) is
  'Elenco paginato dei clienti di un''azienda. p_customer_type: "privato" (clienti finali), "appaltatore" (committenti che passano lavori), "all" (default, comportamento storico).';

revoke all on function public.get_customers_paginated(uuid,text,uuid,boolean,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,text,text,text,text) from public, anon;
grant execute on function public.get_customers_paginated(uuid,text,uuid,boolean,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,text,text,text,text) to authenticated, service_role;
