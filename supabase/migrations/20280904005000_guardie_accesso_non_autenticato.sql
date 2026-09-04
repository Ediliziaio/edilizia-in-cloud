-- Ondata 0.1 — Chiudere l'accesso ai dati senza login (parte 1: le guardie)
--
-- Quattro funzioni-guardia restituivano NULL quando auth.uid() è nullo, perché
-- `NULL = qualcosa` è NULL e `NULL OR false` resta NULL. I chiamanti scrivevano
-- `IF NOT guardia() THEN RAISE`: in plpgsql `IF NULL` non entra nel ramo, quindi
-- l'eccezione non scattava e la funzione proseguiva senza alcun controllo.
--
-- Verificato in produzione prima del fix, con la sola chiave anon:
--   POST /rest/v1/rpc/conversazioni_lista        -> 200, nome/email/telefono/testo messaggi
--   POST /rest/v1/rpc/prossimo_numero_commessa   -> 200, "O-0001"
--
-- Due difese, entrambe necessarie:
--   1. le guardie non restituiscono più NULL  (coalesce(..., false))
--   2. i chiamanti usano `IS NOT TRUE`, che tratta NULL come "non autorizzato"
--      anche se una guardia futura tornasse a essere nullabile.
--
-- Idempotente: solo CREATE OR REPLACE.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le guardie: mai più NULL
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_company_people(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    p_company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND mca.status = 'active'
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_company_people(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND mca.access_role = 'company_admin'
        AND mca.status = 'active'
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.conversazioni_puo_accedere(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    public.is_super_admin(auth.uid())
    OR p_company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_mio_rivenditore(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = p_company_id
        AND c.parent_company_id = public.get_user_company_id(auth.uid())
        AND (
          public.has_role(auth.uid(), 'company_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'produttore_admin'::public.app_role)
        )
    ),
    false
  );
$function$;

-- Stessa classe di difetto: ai_is_service_role() restituisce NULL quando
-- auth.role() è nullo, e i suoi chiamanti scrivono `IF NOT ai_is_service_role()
-- THEN <controllo permessi> END IF` — con NULL il controllo veniva saltato.
CREATE OR REPLACE FUNCTION public.ai_is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    COALESCE(current_setting('request.jwt.claim.role', true), auth.role()::text) = 'service_role',
    false
  );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. I chiamanti: `IS NOT TRUE` invece di `NOT`
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.conversazioni_lista(p_company_id uuid)
 RETURNS TABLE(entita_tipo text, entita_id uuid, nome text, email text, telefono text, ultimo_ts timestamp with time zone, ultimo_canale text, ultimo_direzione text, anteprima text, non_letti bigint, totale_messaggi bigint, stato text, assegnato_a uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH msg AS (
    SELECT * FROM public.v_conversazioni_messaggi WHERE company_id = p_company_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo, m.entita_id, m.ts, m.canale, m.direzione, m.testo
    FROM msg m
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
  ),
  agg AS (
    SELECT m.entita_tipo, m.entita_id, count(*) AS tot, max(m.ts) AS last_ts
    FROM msg m GROUP BY m.entita_tipo, m.entita_id
  )
  SELECT
    a.entita_tipo,
    a.entita_id,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT NULLIF(trim(COALESCE(mc.first_name,'')||' '||COALESCE(mc.last_name,'')), '') FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT NULLIF(trim(COALESCE(pr.first_name,'')||' '||COALESCE(pr.last_name,'')), '') FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT mc.email FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT pr.email FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT mc.phone FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT pr.phone FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    a.last_ts, u.canale, u.direzione, left(u.testo, 140),
    COALESCE(nl.n, 0)::bigint, a.tot::bigint,
    COALESCE(cv.stato, 'aperta'), cv.assegnato_a
  FROM agg a
  JOIN ultimo u ON u.entita_tipo = a.entita_tipo AND u.entita_id = a.entita_id
  LEFT JOIN public.conversazioni cv
         ON cv.company_id = p_company_id AND cv.entita_tipo = a.entita_tipo AND cv.entita_id = a.entita_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM msg m2
    WHERE m2.entita_tipo = a.entita_tipo AND m2.entita_id = a.entita_id
      AND m2.direzione = 'in'
      AND m2.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)
  ) nl ON true
  ORDER BY a.last_ts DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conversazioni_cerca(p_company_id uuid, p_query text)
 RETURNS TABLE(entita_tipo text, entita_id uuid, snippet text, match_ts timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(trim(p_query), '')) < 2 THEN RETURN; END IF;
  RETURN QUERY
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo, m.entita_id, left(m.testo, 160) AS snippet, m.ts AS match_ts
    FROM public.v_conversazioni_messaggi m
    WHERE m.company_id = p_company_id
      AND m.testo ILIKE '%' || trim(p_query) || '%'
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
    LIMIT 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conversazione_timeline(p_entita_tipo text, p_entita_id uuid)
 RETURNS TABLE(canale text, direzione text, controparte text, oggetto text, testo text, media_url text, ts timestamp with time zone, ref_tabella text, ref_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  IF p_entita_tipo = 'contatto' THEN
    SELECT company_id INTO v_company FROM public.marketing_contacts WHERE id = p_entita_id;
  ELSIF p_entita_tipo = 'cliente' THEN
    SELECT company_id INTO v_company FROM public.profiles WHERE id = p_entita_id;
  ELSE
    RAISE EXCEPTION 'entita_tipo non valido: %', p_entita_tipo USING ERRCODE = '22023';
  END IF;
  -- Un'entità inesistente non è un motivo per rispondere "va bene": senza
  -- azienda non c'è modo di verificare il permesso, quindi si nega.
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Accesso negato alla conversazione' USING ERRCODE = '42501';
  END IF;
  IF public.conversazioni_puo_accedere(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato alla conversazione' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.canale, m.direzione, m.controparte, m.oggetto,
           m.testo, m.media_url, m.ts, m.ref_tabella, m.ref_id
    FROM public.v_conversazioni_messaggi m
    WHERE m.entita_tipo = p_entita_tipo AND m.entita_id = p_entita_id
    ORDER BY m.ts ASC;
END;
$function$;

-- Restituiva NULL a chi non ha il permesso: HTTP 200 con corpo `null`, cioè un
-- "no" travestito da risposta valida (C4). Ora dichiara il rifiuto: 42501 ->
-- HTTP 403. Entrambi i chiamanti in src/ trattano già `error` restituendo null,
-- quindi l'interfaccia non cambia comportamento per gli utenti legittimi.
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
  IF public.can_access_company_people(p_company_id) IS NOT TRUE THEN
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
