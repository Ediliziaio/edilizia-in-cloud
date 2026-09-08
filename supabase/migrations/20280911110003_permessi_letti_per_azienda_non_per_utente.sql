-- `staff_permissions` ha una riga per (utente, AZIENDA) — c'e' pure il vincolo
-- UNIQUE (user_id, company_id) — ma quattro funzioni la leggevano come se
-- fosse una riga per utente. Finche' ognuno lavora in una sola azienda non si
-- vede; dal 3 settembre 2026 cinque persone di Green Energy hanno anche
-- Energia Piu', e hanno due righe a testa.
--
-- Cosa succedeva (8 settembre 2026, segnalato da Lidia — pratiche@ — che «non
-- vede nulla» in contatti e opportunita'):
--
--   · solo_assegnati_attivo(): la sottoquery scalare
--     `(SELECT only_assigned FROM staff_permissions WHERE user_id = auth.uid())`
--     con due righe solleva 21000 «more than one row returned by a subquery
--     used as an expression». La funzione sta in 10 policy (marketing_contacts,
--     marketing_opportunities, note e attivita'): la policy esplode, la query
--     fallisce, la pagina resta vuota. Non un permesso negato: un errore.
--
--   · can_see_order(), check_staff_visibility(), has_permission(): usano
--     `SELECT … INTO` / `EXECUTE … INTO`, che con piu' righe NON danno errore
--     ma prendono la prima che capita, senza ordinamento. Cioe' i permessi di
--     un'azienda potevano valere in un'altra. Oggi e' innocuo per un caso
--     fortunato — i cinque utenti hanno permessi identici sulle due aziende,
--     verificato — ma e' esattamente cio' che il multi-azienda serve a
--     differenziare, quindi e' un problema che aspetta di succedere.
--
-- La correzione: si legge la riga dell'azienda in cui si sta lavorando
-- (get_effective_company_id(), che tiene conto di impersonificazione e
-- cambio azienda), e si usa bool_or() al posto della sottoquery scalare —
-- cosi' l'errore «more than one row» e' impossibile per costruzione, anche se
-- un giorno il vincolo UNIQUE sparisse.
--
-- Nessun cambio di comportamento oggi: per chi ha una sola azienda l'azienda
-- effettiva E' quella della sua riga, e i cinque multi-azienda hanno le due
-- righe identiche. Costo: solo_assegnati_attivo e' avvolta in `(SELECT …)` in
-- tutte e 10 le policy, quindi si valuta una volta per query.

-- ── 1. Quella che andava in errore ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solo_assegnati_attivo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'company_admin'::public.app_role) THEN false
    ELSE COALESCE(
      (SELECT bool_or(sp.only_assigned)
         FROM public.staff_permissions sp
        WHERE sp.user_id = auth.uid()
          AND sp.company_id = public.get_effective_company_id()),
      false
    )
  END;
$function$;

-- ── 2. Le tre che sceglievano una riga a caso ──────────────────────────────
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

  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
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
  IF has_role(_uid, 'super_admin'::app_role) OR has_role(_uid, 'company_admin'::app_role) THEN
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

  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  IF NOT has_role(_user_id, 'company_staff'::app_role) THEN
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

  -- Tutti i chiamanti passano l'utente corrente (assert_permesso,
  -- valida_sconto_fv, valida_sconto_progetto e le 117 policy): si guarda la
  -- riga dell'azienda in cui sta lavorando. Se si chiede di un altro utente
  -- si ricade sul "ce l'ha in almeno una azienda", come faceva prima ma senza
  -- dipendere da quale riga capita per prima.
  _company := CASE WHEN _user_id IS NOT DISTINCT FROM auth.uid()
                   THEN public.get_effective_company_id() END;

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
