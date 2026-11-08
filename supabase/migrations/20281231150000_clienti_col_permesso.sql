-- Elenco clienti col permesso, anche nel database (08/11/2026).
--
-- `get_customers_paginated` e `get_customer_stats` controllavano solo «sei di
-- questa azienda»: un commerciale che ha solo i contatti del CRM, con una
-- chiamata diretta, leggeva l'elenco intero dei clienti, CF e telefoni compresi;
-- e chi ha «Solo i propri» vedeva tutti i clienti dell'azienda.
--
-- Da qui: i clienti sono di chi segue le commesse o ha la sezione Clienti, su
-- QUELL'azienda (amministratore, super admin, commercialista e server come
-- prima). Con «Solo i propri» si vedono i clienti di cui si è il venditore e
-- quelli delle proprie commesse.
-- Il limite si calcola sull'azienda chiesta, non su quella «effettiva»: chi ha
-- più aziende non lo aggira passando un altro id.
--
-- Non si toccano policy: CREATE OR REPLACE è istantaneo e non blocca auth.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.puo_vedere_clienti(p_company_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or public.can_accountant_access_company(p_company_id, null)
    or (not public.utente_e_cliente_esterno()
        and p_company_id = any(public.aziende_con_uno_dei_permessi(array['can_view_customers', 'can_view_orders']))),
  false);
$function$;

revoke all on function public.puo_vedere_clienti(uuid) from public, anon, authenticated;

-- NULL = nessun limite. Altrimenti gli id dei clienti assegnati a chi chiama.
create or replace function public.clienti_solo_assegnati(p_company_id uuid)
returns uuid[]
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_utente uuid := auth.uid();
begin
  if v_utente is null
     or public.has_role(v_utente, 'super_admin'::public.app_role)
     or public.e_amministratore_di(p_company_id)
     or not exists (select 1 from public.staff_permissions sp
                     where sp.user_id = v_utente
                       and sp.company_id = p_company_id
                       and sp.only_assigned) then
    return null;
  end if;

  return array(
    select p.id
      from public.profiles p
     where p.company_id = p_company_id
       and p.salesperson_id in (select s.id from public.salespeople s
                                 where s.user_id = v_utente and s.company_id = p_company_id)
    union
    select o.customer_id
      from public.orders o
     where o.company_id = p_company_id
       and o.customer_id is not null
       and (o.assigned_to = v_utente
            or public.order_has_employee_for_user(o.id, v_utente)
            or public.order_has_salesperson_for_user(o.id, v_utente)
            or exists (select 1 from public.order_campo_assignments oca
                        where oca.order_id = o.id and oca.user_id = v_utente))
  );
end;
$function$;

revoke all on function public.clienti_solo_assegnati(uuid) from public, anon, authenticated;

create or replace function public.get_customers_paginated(p_company_id uuid, p_search text DEFAULT NULL::text, p_salesperson_id uuid DEFAULT NULL::uuid, p_salesperson_none boolean DEFAULT false, p_has_orders text DEFAULT 'all'::text, p_sort_field text DEFAULT 'name'::text, p_sort_dir text DEFAULT 'asc'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_has_phone text DEFAULT 'all'::text, p_has_fiscal_code text DEFAULT 'all'::text, p_has_site_address text DEFAULT 'all'::text, p_portal_state text DEFAULT 'all'::text, p_customer_type text DEFAULT 'all'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  v_assegnati uuid[];
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

create or replace function public.get_customer_stats(p_company_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  v_total INT;
  v_month_current INT;
  v_month_previous INT;
  v_with_orders INT;
  v_without_orders INT;
  v_portal_disabled INT;
  v_current_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_previous_month_start TIMESTAMPTZ := date_trunc('month', now()) - INTERVAL '1 month';
  v_assegnati uuid[];
BEGIN
  PERFORM public._solo_ufficio();
  PERFORM public.assert_company_access(p_company_id);
  IF NOT public.puo_vedere_clienti(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato: serve il permesso sui clienti' USING ERRCODE = '42501';
  END IF;
  v_assegnati := public.clienti_solo_assegnati(p_company_id);

  SELECT COUNT(*)
  INTO v_total
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND (v_assegnati IS NULL OR p.id = ANY(v_assegnati));

  SELECT COUNT(*)
  INTO v_month_current
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND (v_assegnati IS NULL OR p.id = ANY(v_assegnati))
    AND p.created_at >= v_current_month_start;

  SELECT COUNT(*)
  INTO v_month_previous
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND (v_assegnati IS NULL OR p.id = ANY(v_assegnati))
    AND p.created_at >= v_previous_month_start
    AND p.created_at < v_current_month_start;

  SELECT COUNT(DISTINCT p.id)
  INTO v_with_orders
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  INNER JOIN public.orders o ON o.customer_id = p.id AND o.company_id = p_company_id
  WHERE p.company_id = p_company_id
    AND (v_assegnati IS NULL OR p.id = ANY(v_assegnati));

  v_without_orders := GREATEST(v_total - v_with_orders, 0);

  SELECT COUNT(*)
  INTO v_portal_disabled
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
  WHERE p.company_id = p_company_id
    AND (v_assegnati IS NULL OR p.id = ANY(v_assegnati))
    AND COALESCE(p.portal_disabled, FALSE) = TRUE;

  SELECT json_build_object(
    'total', COALESCE(v_total, 0),
    'month_current', COALESCE(v_month_current, 0),
    'month_previous', COALESCE(v_month_previous, 0),
    'with_orders', COALESCE(v_with_orders, 0),
    'without_orders', COALESCE(v_without_orders, 0),
    'portal_disabled', COALESCE(v_portal_disabled, 0)
  ) INTO result;

  RETURN result;
END;
$function$;
