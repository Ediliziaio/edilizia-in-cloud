-- Il numeratore delle commesse risponde anche al server MCP (connettore AI).
--
-- Il connettore «Collega a Claude · ChatGPT» crea le commesse come l'app:
-- prossimo_numero_commessa → stato iniziale → create_order_atomic. Il server MCP
-- chiama il database col ruolo service_role, dove auth.uid() è vuoto, e
-- can_access_company_people() lo respingeva con «Accesso negato»: le commesse
-- create dall'assistente nascevano senza codice. L'ambito d'azienda lo garantisce
-- già il server (company_id viene dalla chiave, mai dal client), come per le
-- altre funzioni che ammettono service_role (user_can_access_company).
--
-- Cambia solo il controllo d'accesso; il calcolo del codice è identico.

CREATE OR REPLACE FUNCTION public.prossimo_numero_commessa(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_max    bigint;
  v_code   text;
  v_i      int := 0;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     AND public.can_access_company_people(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(btrim(order_code_prefix), ''), 'O')
    INTO v_prefix
  FROM public.companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'O'; END IF;

  SELECT coalesce(max((regexp_match(order_code, '([0-9]+)\s*$'))[1]::bigint), 0)
    INTO v_max
  FROM public.orders
  WHERE company_id = p_company_id
    AND order_code IS NOT NULL
    AND lower(order_code) LIKE lower(v_prefix) || '%'
    AND order_code ~ '[0-9]+\s*$';

  v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');

  WHILE v_i < 10000 AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE company_id = p_company_id AND lower(order_code) = lower(v_code)
  ) LOOP
    v_max := v_max + 1;
    v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
    v_i := v_i + 1;
  END LOOP;

  RETURN v_code;
END;
$function$;

-- I privilegi restano quelli di prima: niente anon, sì authenticated e service_role.
REVOKE ALL ON FUNCTION public.prossimo_numero_commessa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prossimo_numero_commessa(uuid) TO authenticated, service_role;
