-- Ondata 4 — l'attore dello storico viene da auth.uid(), mai dal client
--
-- Misurato in produzione su company_activity_log:
--     righe totali                            7.438
--     con user_id azzerato (000…000)          5.408
--     senza actor_user_id                     7.378
--     senza actor_name                        7.421
--     ultimi 7 giorni                         1.709
--     di cui non attribuibili                 1.679   (98%)
--
-- Un titolare che apre il registro attività per capire chi ha toccato una
-- commessa non trova nulla di utile in 98 righe su 100.
--
-- ── La causa, trovata leggendo il codice e poi verificata sul vivo ──────────
-- I cinque trigger MP-06 (orders, quotes, contacts, employees, listino)
-- ricavavano l'attore così:
--     v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
-- Quella variabile è la vecchia forma di PostgREST, e non viene più impostata.
-- Sondato durante una richiesta autenticata vera:
--     request.jwt.claim.sub      -> NON IMPOSTATA
--     request.jwt.claims ->> sub -> 0a5dd3d4-…
--     auth.uid()                 -> 0a5dd3d4-…
-- Quindi v_actor era sempre NULL, e log_activity riceveva NULL.
--
-- ── E il secondo difetto: NULL diventava un utente finto ────────────────────
-- log_activity scriveva nella colonna legacy
--     coalesce(p_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
-- inventando un utente che non esiste. Una riga senza attore non è una riga di
-- un utente chiamato zero: è una riga non attribuita, e deve dirlo.
--
-- ── La regola che resta ─────────────────────────────────────────────────────
-- L'attore è auth.uid() quando c'è una sessione, SEMPRE, anche se il chiamante
-- passa qualcos'altro: nessun client può firmare la cronologia a nome di un
-- altro. Il parametro serve solo quando una sessione non c'è (cron, edge
-- function col service role che agisce per conto di un utente già verificato).
-- Se non si sa chi è, la colonna resta NULL.
--
-- Le righe storiche non sono recuperabili: l'attore non è mai stato scritto.
-- Gli zeri però si possono smettere di raccontare, e diventano NULL.

-- 1. "Non lo so" deve essere esprimibile.
ALTER TABLE public.company_activity_log ALTER COLUMN user_id DROP NOT NULL;

-- 2. Il registratore: auth.uid() vince sempre sul parametro.
CREATE OR REPLACE FUNCTION public.log_activity(
  p_company_id uuid, p_category text, p_event_type text, p_actor_user_id uuid,
  p_target_table text, p_target_id text, p_target_label text, p_description text,
  p_changes jsonb DEFAULT NULL::jsonb, p_before_snapshot jsonb DEFAULT NULL::jsonb,
  p_after_snapshot jsonb DEFAULT NULL::jsonb, p_importance text DEFAULT 'normal'::text,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_source_function text DEFAULT NULL::text,
  p_trace_id text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_actor uuid;
  v_actor_name text;
  v_actor_role text;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- L'identità della sessione batte sempre il parametro: un client autenticato
  -- non può scrivere nello storico a nome di qualcun altro. Il parametro resta
  -- utile solo dove una sessione non c'è (cron, service role).
  v_actor := coalesce(auth.uid(), p_actor_user_id);

  IF v_actor IS NOT NULL THEN
    SELECT
      coalesce(
        nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
        pr.email, u.email, '?'
      ),
      (SELECT role::text FROM public.user_roles
       WHERE user_id = v_actor
       ORDER BY array_position(
         ARRAY['super_admin','company_admin','company_staff','salesperson','employee','worker','subcontractor'],
         role::text)
       LIMIT 1)
    INTO v_actor_name, v_actor_role
    FROM auth.users u
    LEFT JOIN public.profiles pr ON pr.id = u.id
    WHERE u.id = v_actor;
  END IF;

  INSERT INTO public.company_activity_log (
    company_id,
    user_id, action, target_type, target_id, details,
    category, event_type,
    actor_user_id, actor_name, actor_role,
    target_table, target_label,
    changes, before_snapshot, after_snapshot,
    description, importance, metadata,
    source_function, trace_id
  )
  VALUES (
    p_company_id,
    -- niente più utente inventato: se non si sa, resta vuoto
    v_actor,
    p_event_type, p_target_table, p_target_id, coalesce(p_metadata, '{}'::jsonb),
    p_category, p_event_type,
    v_actor, v_actor_name, v_actor_role,
    p_target_table, p_target_label,
    p_changes, p_before_snapshot, p_after_snapshot,
    p_description, coalesce(p_importance, 'normal'), coalesce(p_metadata, '{}'::jsonb),
    p_source_function, p_trace_id
  )
  RETURNING id INTO v_id;

  PERFORM pg_notify('activity_log_new', v_id::text);
  RETURN v_id;
END;
$function$;

-- 3. I cinque trigger: via la variabile morta, dentro auth.uid().
--    Sostituzione testuale esatta della sola riga sbagliata, dal catalogo, così
--    il resto di ogni trigger resta identico e non c'è nulla da ricopiare.
DO $$
DECLARE
  r       record;
  v_nuovo text;
  v_fatte text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS firma, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%request.jwt.claim.sub%'
      AND p.proname LIKE 'tg_activity_on_%'
  LOOP
    v_nuovo := replace(
      r.def,
      'nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid',
      'auth.uid()');
    IF v_nuovo IS DISTINCT FROM r.def THEN
      EXECUTE v_nuovo;
      v_fatte := v_fatte || r.firma;
    END IF;
  END LOOP;

  RAISE LOG 'attore storico — trigger corretti: %', array_to_string(v_fatte, ', ');

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'tg_activity_on_%'
      AND p.prosrc LIKE '%request.jwt.claim.sub%'
  ) THEN
    RAISE EXCEPTION 'restano trigger che leggono request.jwt.claim.sub';
  END IF;
END $$;

-- 4. Il trigger legacy smette anche lui di inventare l'utente zero.
--    (Usava già auth.uid(), ma lo trasformava in zeri per la colonna legacy.)
CREATE OR REPLACE FUNCTION public.log_company_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid; _user_id uuid; _action text; _target_type text;
  _target_id text; _details jsonb; _target_label text; _description text;
BEGIN
  IF TG_TABLE_NAME IN ('orders', 'employees') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  _user_id := auth.uid();     -- niente zeri: se non c'è, resta NULL

  CASE TG_TABLE_NAME
    WHEN 'order_status_history' THEN
      _target_type := 'orders'; _action := 'order.status_updated';
      _target_id := NEW.order_id::text;
      SELECT o.company_id INTO _company_id FROM public.orders o WHERE o.id = NEW.order_id;
      _details := jsonb_build_object('status_id', NEW.status_id::text);
    WHEN 'suppliers' THEN
      _target_type := 'suppliers';
      IF TG_OP = 'INSERT' THEN
        _company_id := NEW.company_id; _action := 'supplier.created';
        _target_id := NEW.id::text; _details := jsonb_build_object('name', NEW.name);
      ELSIF TG_OP = 'UPDATE' THEN
        _company_id := NEW.company_id; _action := 'supplier.updated';
        _target_id := NEW.id::text; _details := jsonb_build_object('name', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        _company_id := OLD.company_id; _action := 'supplier.deleted';
        _target_id := OLD.id::text; _details := jsonb_build_object('name', OLD.name);
      END IF;
    WHEN 'profiles' THEN
      _target_type := 'customers';
      _company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
      IF _company_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;
      IF TG_OP = 'INSERT' THEN
        _action := 'customer.created'; _target_id := NEW.id::text;
        _details := jsonb_build_object('name', trim(coalesce(NEW.first_name,'')||' '||coalesce(NEW.last_name,'')));
      ELSIF TG_OP = 'UPDATE' THEN
        _action := 'customer.updated'; _target_id := NEW.id::text;
        _details := jsonb_build_object('name', trim(coalesce(NEW.first_name,'')||' '||coalesce(NEW.last_name,'')));
      ELSIF TG_OP = 'DELETE' THEN
        _action := 'customer.deleted'; _target_id := OLD.id::text;
        _details := jsonb_build_object('name', trim(coalesce(OLD.first_name,'')||' '||coalesce(OLD.last_name,'')));
      END IF;
    ELSE
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END CASE;

  _target_label := COALESCE(_details->>'order_code', _details->>'name', _details->>'description', _target_id);
  _description  := concat_ws(' ', _action, 'su', _target_type, _target_label);

  IF _company_id IS NOT NULL THEN
    INSERT INTO public.company_activity_log (
      company_id, user_id, action, target_type, target_id, details,
      category, event_type, actor_user_id, target_table, target_label,
      description, importance, metadata, source_function
    ) VALUES (
      _company_id, _user_id, _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb),
      public.activity_category_for_event(_action, _target_type),
      _action, _user_id, _target_type, _target_label, _description, 'normal',
      COALESCE(_details, '{}'::jsonb) || jsonb_build_object('legacy_function', true),
      'trigger:log_company_activity'
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- 5. Le righe storiche: l'attore non c'è e non tornerà, ma smettiamo di
--    raccontare che sia un utente. Zero -> vuoto, che l'interfaccia mostra
--    come "Non attribuito".
UPDATE public.company_activity_log
   SET user_id = NULL
 WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid;
