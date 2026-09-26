-- Amministratore DI QUALE azienda — lotto 2: le quattro funzioni centrali
-- (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- has_permission, check_staff_visibility, can_see_order e solo_assegnati_attivo
-- cominciavano con «se ha il ruolo company_admin, sì a tutto». Il ruolo sta in
-- user_roles senza azienda: l'amministratore della propria azienda A, entrato
-- in un'azienda B con un accesso multi-azienda da staff SENZA permessi, in B
-- aveva tutti i permessi (has_permission diceva sì a qualunque permesso) e
-- nessuna restrizione «solo assegnati». Lo usano 100 policy (has_permission),
-- 39 (check_staff_visibility), 10 (solo_assegnati_attivo), 8 (can_see_order),
-- più le RPC che chiamano assert_permesso.
--
-- Provato prima, in una transazione annullata, con l'amministratore di
-- un'azienda demo invitato come staff senza permessi in un'altra azienda demo:
-- has_permission sì su preventivi e commesse (con il ruolo di staff: no).
--
-- Ora l'amministratore vale per l'azienda in cui si lavora
-- (e_amministratore_di(get_effective_company_id()): azienda del profilo col
-- ruolo, o accesso multi-azienda attivo da amministratore). Quando si chiede
-- di un ALTRO utente (nessun chiamante lo fa oggi: policy e RPC passano
-- auth.uid()) resta il comportamento di prima.
--
-- In has_permission, chi è entrato in questa azienda con un accesso
-- multi-azienda attivo da staff prende i permessi di staff che gli ha dato
-- QUESTA azienda (staff_permissions della riga di questa azienda), anche se
-- altrove ha un altro ruolo: è ciò che l'app gli mostra già (usePermissions
-- usa l'access_role dell'azienda selezionata). Il 26/09 i 5 accessi da staff
-- sono tutti di persone che hanno già il ruolo company_staff: per loro non
-- cambia niente.
--
-- Il 26/09 nessun utente reale era nel caso del buco: per tutti gli utenti di
-- oggi le quattro funzioni rispondono come prima. Costo: e_amministratore_di
-- è un solo EXISTS (~30 µs) contro i ~200 µs di has_role, quindi le policy
-- che le chiamano riga per riga non rallentano.
--
-- Rilanciabile: CREATE OR REPLACE (i GRANT restano). La guardia ferma tutto se
-- una funzione è stata cambiata da un'altra sessione dopo il censimento.

SET LOCAL lock_timeout = '3s';

DO $guardia$
DECLARE
  r record;
  v_src text;
BEGIN
  IF to_regprocedure('public.e_amministratore_di(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Manca e_amministratore_di: applicare prima il lotto 1';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('public.has_permission(uuid,text)',            'b3a01acff7e13add42b3fe996afc1869'),
    ('public.check_staff_visibility(uuid,uuid)',    '248408ec07e19abc4651c03e8063e4ad'),
    ('public.can_see_order(uuid,uuid,uuid)',        '4ac1cf1b15d2eea1a4b4b8c0f681ec2b'),
    ('public.solo_assegnati_attivo()',              'eb0d086ba4634bf7bd277d20b6611350')
  ) AS v(firma, impronta)
  LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(r.firma);
    IF v_src IS NULL THEN
      RAISE EXCEPTION 'Funzione % non trovata: il lotto va rivisto', r.firma;
    END IF;
    IF md5(v_src) <> r.impronta AND v_src !~ 'e_amministratore_di' THEN
      RAISE EXCEPTION 'Funzione % cambiata dopo il censimento: il lotto va rivisto', r.firma;
    END IF;
  END LOOP;
END
$guardia$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_perm boolean;
  _company  uuid;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  IF has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Tutti i chiamanti passano l'utente corrente (assert_permesso,
  -- valida_sconto_fv, valida_sconto_progetto e le policy): si guarda l'azienda
  -- in cui sta lavorando. Se si chiede di un altro utente si ricade sul «ce
  -- l'ha in almeno una azienda», come prima.
  _company := CASE WHEN _user_id IS NOT DISTINCT FROM auth.uid()
                   THEN public.get_effective_company_id() END;

  -- Amministratore di QUESTA azienda (26/09/2026). Prima bastava il ruolo, di
  -- un'azienda qualsiasi: l'amministratore di A entrato in B come staff senza
  -- permessi, in B aveva tutti i permessi.
  IF _company IS NOT NULL THEN
    IF public.e_amministratore_di(_company) THEN
      RETURN true;
    END IF;
  ELSIF has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Staff: col ruolo, oppure con un accesso multi-azienda attivo da staff
  -- proprio in questa azienda. Chi è amministratore altrove ed è entrato qui
  -- come staff prende i permessi che gli ha dato QUESTA azienda.
  IF NOT (
    has_role(_user_id, 'company_staff'::app_role)
    OR (_company IS NOT NULL
        AND NOT public.utente_bloccato()
        AND EXISTS (
          SELECT 1 FROM public.multi_company_access m
           WHERE m.user_id = _user_id
             AND m.company_id = _company
             AND m.access_role = 'company_staff'
             AND m.status = 'active'
             AND (m.expires_at IS NULL OR m.expires_at > now())))
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_permissions'
      AND column_name = _permission
  ) THEN
    RETURN false;
  END IF;

  BEGIN
    IF _company IS NULL THEN
      EXECUTE format(
        'SELECT bool_or(%I) FROM public.staff_permissions WHERE user_id = $1',
        _permission
      ) INTO _has_perm USING _user_id;
    ELSE
      EXECUTE format(
        'SELECT bool_or(%I) FROM public.staff_permissions WHERE user_id = $1 AND company_id = $2',
        _permission
      ) INTO _has_perm USING _user_id, _company;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN COALESCE(_has_perm, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_staff_visibility(_user_id uuid, _assigned_to uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _only_assigned boolean;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  IF has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Amministratore dell'azienda in cui si lavora (26/09/2026: prima bastava il
  -- ruolo, di un'azienda qualsiasi). Per un altro utente, come prima: il ruolo.
  IF _user_id IS NOT DISTINCT FROM auth.uid() THEN
    IF public.e_amministratore_di(public.get_effective_company_id()) THEN
      RETURN true;
    END IF;
  ELSIF has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Se si chiede di un altro utente non ha senso l'azienda ATTIVA di chi
  -- chiede: in quel caso vale la piu' restrittiva fra le sue righe.
  SELECT bool_or(sp.only_assigned) INTO _only_assigned
    FROM public.staff_permissions sp
   WHERE sp.user_id = _user_id
     AND (_user_id IS DISTINCT FROM auth.uid()
          OR sp.company_id = public.get_effective_company_id());

  IF _only_assigned IS NULL OR _only_assigned = false THEN
    RETURN true;
  END IF;

  -- Il responsabile di una squadra vede anche quello che è assegnato ai membri.
  IF _assigned_to IS NOT NULL AND _assigned_to <> _user_id AND EXISTS (
    SELECT 1
      FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
     WHERE t.leader_id = _user_id
       AND tm.user_id = _assigned_to
       AND (_user_id IS DISTINCT FROM auth.uid()
            OR t.company_id = public.get_effective_company_id())
  ) THEN
    RETURN true;
  END IF;

  RETURN _assigned_to = _user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_see_order(_order_id uuid, _assigned_to uuid, _warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _only_assigned boolean;
  _only_warehouse boolean;
BEGIN
  -- Amministratore dell'azienda in cui si lavora (26/09/2026: prima bastava il
  -- ruolo, di un'azienda qualsiasi).
  IF has_role(_uid, 'super_admin'::app_role)
     OR public.e_amministratore_di(public.get_effective_company_id()) THEN
    RETURN true;
  END IF;

  SELECT bool_or(only_assigned), bool_or(only_my_warehouse)
    INTO _only_assigned, _only_warehouse
  FROM public.staff_permissions
  WHERE user_id = _uid
    AND company_id = public.get_effective_company_id();

  IF COALESCE(_only_assigned, false) THEN
    RETURN _assigned_to = _uid;
  END IF;

  IF COALESCE(_only_warehouse, false) THEN
    -- Prima le verifiche a costo zero, la scansione righe solo se serve.
    IF _assigned_to = _uid THEN RETURN true; END IF;
    IF _warehouse_id IS NOT NULL
       AND _warehouse_id = ANY(public.get_my_warehouse_ids()) THEN RETURN true; END IF;
    RETURN public.order_has_item_in_my_warehouse(_order_id);
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.solo_assegnati_attivo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- l'amministratore dell'azienda in cui si lavora non ha restrizioni
    -- (26/09/2026: prima bastava il ruolo, di un'azienda qualsiasi)
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.e_amministratore_di(public.get_effective_company_id()) THEN false
    ELSE COALESCE(
      (SELECT bool_or(sp.only_assigned)
         FROM public.staff_permissions sp
        WHERE sp.user_id = auth.uid()
          AND sp.company_id = public.get_effective_company_id()),
      false
    )
  END;
$function$;
