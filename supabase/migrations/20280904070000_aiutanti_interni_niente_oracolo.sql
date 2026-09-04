-- Ondata 0.1, seguito — gli aiutanti interni smettono di rispondere all'anonimo
--
-- Dopo la revoca della superficie RPC restavano raggiungibili senza login alcune
-- funzioni ausiliarie. Non per svista: sono citate dentro le policy RLS, e le
-- espressioni di policy vengono valutate con i privilegi di chi interroga.
-- Togliere loro EXECUTE non avrebbe protetto niente — avrebbe rotto la lettura
-- delle tabelle che le usano, comprese quelle delle pagine pubbliche.
--
-- Ma sono tutte SECURITY DEFINER e accettano un identificativo arbitrario,
-- quindi funzionano come oracoli. Verificato in produzione con la sola chiave
-- anon, prima di questo intervento:
--
--   POST /rest/v1/rpc/has_role
--        {"_user_id":"<uuid>","_role":"company_admin"}   -> 200  true
--   POST /rest/v1/rpc/get_user_company_id
--        {"_user_id":"<uuid>"}                           -> 200  "778a2c76-…"
--
-- Cioè: con un identificativo utente si scopriva a quale azienda appartiene e
-- se è amministratore. Con un identificativo di commessa, a chi appartiene la
-- commessa.
--
-- La cura non tocca i privilegi: la guardia sta DENTRO la funzione e riguarda
-- solo il chiamante anonimo. Le policy continuano a valutarsi esattamente come
-- prima — per un anonimo restituivano comunque falso, perché non c'è un utente
-- a cui riferirsi — e nessun percorso interno cambia.
--
-- La distinzione è precisa e verificata: durante una richiesta anonima
-- PostgREST imposta request.jwt.claims con role "anon" e auth.uid() è nullo. Da
-- cron, da un trigger o da psql quel parametro è del tutto assente, quindi il
-- codice interno non è toccato; con il service role il ruolo è "service_role".
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.chiamante_anonimo()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- true SOLO per una vera richiesta API senza sessione.
  -- Assenza di request.jwt.claims = non è una richiesta API (cron, trigger,
  -- psql): quel codice deve continuare a funzionare come prima.
  SELECT auth.uid() IS NULL
     AND coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'anon';
$function$;

COMMENT ON FUNCTION public.chiamante_anonimo() IS
  'true solo durante una richiesta API senza sessione. Serve alle funzioni '
  'ausiliarie che devono restare eseguibili (sono usate nelle policy RLS) ma '
  'non devono rispondere a chi non ha fatto login.';

-- Non rivela nulla che il chiamante non sappia già di sé.
GRANT EXECUTE ON FUNCTION public.chiamante_anonimo() TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Gli oracoli, uno per uno. Corpo invariato: cambia solo la prima riga.
-- ─────────────────────────────────────────────────────────────────────────────

-- utente -> ruolo. Era il peggiore: rispondeva `true` su un utente qualsiasi.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN false ELSE EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  ) END;
$function$;

-- utente -> azienda
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN NULL::uuid ELSE (
    SELECT company_id FROM public.profiles WHERE id = _user_id
  ) END;
$function$;

-- commessa -> azienda proprietaria
CREATE OR REPLACE FUNCTION public.get_order_company_id(_order_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN NULL::uuid ELSE (
    SELECT company_id FROM public.orders WHERE id = _order_id
  ) END;
$function$;

-- commessa -> cliente
CREATE OR REPLACE FUNCTION public.get_order_customer_id(_order_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN NULL::uuid ELSE (
    SELECT customer_id FROM public.orders WHERE id = _order_id
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.get_platform_admin_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN NULL::uuid ELSE (
    SELECT id FROM public.companies WHERE is_platform_admin_company = true LIMIT 1
  ) END;
$function$;

-- commessa + utente -> "questo utente lavora su questa commessa?"
CREATE OR REPLACE FUNCTION public.order_has_employee_for_user(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN false ELSE EXISTS (
    SELECT 1 FROM public.order_employees oe
    JOIN public.employees e ON e.id = oe.employee_id
    WHERE oe.order_id = _order_id AND e.user_id = _user_id
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.order_has_salesperson_for_user(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN false ELSE EXISTS (
    SELECT 1 FROM public.order_salespeople os
    JOIN public.salespeople s ON s.id = os.salesperson_id
    WHERE os.order_id = _order_id AND s.user_id = _user_id
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.utente_in_ufficio(_user uuid, _ufficio uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN false ELSE EXISTS (
    SELECT 1 FROM public.ufficio_membri m
    WHERE m.profile_id = _user AND m.ufficio_id = _ufficio
  ) END;
$function$;

-- oracolo di esistenza su un identificativo di canale
CREATE OR REPLACE FUNCTION public.internal_chat_is_order_channel(p_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.chiamante_anonimo() THEN false ELSE EXISTS (
    SELECT 1 FROM public.internal_chat_channels c
    WHERE c.id = p_channel_id AND c.order_id IS NOT NULL
  ) END;
$function$;

-- ── plpgsql: una riga in testa, il resto identico all'originale ──────────────

CREATE OR REPLACE FUNCTION public.check_staff_visibility(_user_id uuid, _assigned_to uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _only_assigned boolean;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT only_assigned INTO _only_assigned
  FROM public.staff_permissions
  WHERE user_id = _user_id;

  IF _only_assigned IS NULL OR _only_assigned = false THEN
    RETURN true;
  END IF;

  RETURN _assigned_to = _user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _has_perm boolean;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  -- Super admin and company admin have all permissions
  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Check if user is company_staff (or salesperson/call_center which also have company_staff)
  IF NOT has_role(_user_id, 'company_staff'::app_role) THEN
    RETURN false;
  END IF;

  -- Validate that the permission column exists before querying to avoid SQL exceptions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_permissions'
      AND column_name = _permission
  ) THEN
    RETURN false;
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT %I FROM public.staff_permissions WHERE user_id = $1',
      _permission
    ) INTO _has_perm USING _user_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN COALESCE(_has_perm, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_permission_for_company(_user_id uuid, _permission text, _company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  _has boolean;
begin
  if public.chiamante_anonimo() then return false; end if;

  if _user_id is null or _company_id is null then
    return false;
  end if;

  if has_role(_user_id, 'super_admin'::app_role) then
    return true;
  end if;

  if has_role(_user_id, 'company_admin'::app_role)
     and _company_id = get_user_company_id(_user_id) then
    return true;
  end if;

  if exists (
    select 1 from public.multi_company_access mca
    where mca.user_id = _user_id
      and mca.company_id = _company_id
      and mca.status = 'active'
      and (mca.expires_at is null or mca.expires_at > now())
      and mca.access_role::text = 'company_admin'
  ) then
    return true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_permissions'
      and column_name = _permission
  ) then
    return false;
  end if;

  begin
    execute format(
      'select %I from public.staff_permissions where user_id = $1 and company_id = $2 limit 1',
      _permission
    ) into _has using _user_id, _company_id;
  exception when others then
    return false;
  end;

  return coalesce(_has, false);
end;
$function$;
