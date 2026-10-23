-- Funzioni delle regole di lettura più leggere (12/10/2026).
-- Applicata il 23/10/2026: le dieci funzioni avevano ancora il corpo censito il
-- 12/10. Misurato nella stessa transazione, un amministratore di Demo 2, cache
-- calda (preparazione + esecuzione): fasi di una commessa 75 -> 45 ms, rate
-- 175 -> 95 ms, la commessa 23 -> 12 ms. Dopo: stesse righe visibili (222
-- commesse, nessuna di altre aziende).
--
-- Le regole RLS chiamano a ogni query una manciata di funzioni di supporto:
-- utente_bloccato(), has_role(), get_user_company_id(), get_my_company_id(),
-- solo_assegnati_attivo()... Erano funzioni SQL con SET search_path, che
-- PostgreSQL 17 non mette in cache: ogni punto di chiamata ripianifica il
-- corpo, e quando una funzione SQL ne chiama un'altra la interna viene
-- ripianificata a OGNI chiamata, anche riga per riga. Misurato in produzione
-- (stessa sessione, catalogo caldo):
--
--                              per query (initplan)   per riga
--   solo_assegnati_attivo()     4,5 ms  -> 0,26 ms    2,1 ms  -> 0,16 ms
--   e_amministratore_di()       1,1 ms  -> 0,15 ms
--   get_my_company_id()         0,71 ms -> 0,09 ms    0,66 ms -> 0,055 ms
--   get_effective_company_id()  0,69 ms -> 0,08 ms
--   has_role()                  0,43 ms -> 0,10 ms    0,22 ms -> 0,036 ms
--   get_user_company_id()       0,37 ms -> 0,10 ms    0,22 ms -> 0,036 ms
--   has_permission() staff      1,15 ms -> 0,50 ms    1,07 ms -> 0,42 ms
--
-- Il kanban delle opportunità di un call center ne valuta una quindicina per
-- chiamata (circa 100 ms su 340), la scheda commessa decine.
--
-- In plpgsql le stesse funzioni tengono il piano in cache per connessione, e
-- una funzione SQL che chiama una funzione plpgsql non la ripianifica più:
-- convertire le funzioni "foglia" alleggerisce anche le decine di funzioni SQL
-- che le usano (admin_ha_uno_di, user_can_access_company, pipeline_nascoste...).
--
-- La logica è la stessa riga per riga: stessi controlli, nello stesso ordine,
-- stessi risultati. Verificato prima di scrivere questo file, in una
-- transazione annullata, confrontando le funzioni attuali con le copie
-- plpgsql per tutti gli utenti e per il chiamante anonimo (16 valori per
-- utente: has_role per ogni ruolo, aziende, amministratore di, solo
-- assegnati...): 0 differenze. has_permission: tutti gli utenti x 10 permessi
-- (anche una colonna inesistente e una non booleana), 0 differenze.
--
-- has_permission, has_permission_for_company e aziende_con_permesso
-- controllano che la colonna del permesso esista leggendo pg_attribute invece
-- di information_schema.columns (stesse 103 colonne, verificato): il resto del
-- corpo resta com'è. Il pezzo si sostituisce sul testo attuale della funzione
-- e deve comparire una volta sola.
--
-- CREATE OR REPLACE tiene proprietario, GRANT e dipendenze (1.663 policy
-- usano utente_bloccato, 1.191 has_role). Attributi invariati: STABLE,
-- SECURITY DEFINER (tranne chiamante_anonimo, che resta INVOKER), PARALLEL
-- UNSAFE, COST 100, SET search_path = public.
--
-- Rilanciabile: ogni funzione deve avere il corpo censito il 12/10/2026
-- oppure esattamente quello nuovo (impronte md5 di entrambi); se è stata
-- cambiata da altri nel frattempo, la migrazione si ferma senza toccare
-- niente. Nessun lock su tabelle: si sostituiscono solo funzioni.

set local lock_timeout = '3s';

do $$
declare
  -- Per ogni funzione: [impronta del corpo censito, impronta del corpo nuovo].
  v_attese constant jsonb := jsonb_build_object(
    'public.chiamante_anonimo()',            jsonb_build_array('7012bb9cbf9c7ca4f334ff89ef46f673', 'c8ed42daa607b13e979998e9a1ecd738'),
    'public.utente_bloccato()',              jsonb_build_array('500321c342986e74d56837345c48894d', '02e4b8e473b2f23ca707786a151d5c4f'),
    'public.has_role(uuid,public.app_role)', jsonb_build_array('1a5b6b4b10d202ffdf21ca4bf75385e8', 'e39a12e402a20f0af70143f1ac3759fd'),
    'public.get_user_company_id(uuid)',      jsonb_build_array('ef97986b03ede24a9e7c85349027ad70', '3d4f65b3dcc3ddc69ddcc9198fa119e3'),
    'public.get_effective_company_id()',     jsonb_build_array('33ab7fe4f97dd4efe82ac72ab2a661be', '7b00d4e19a00970b565cc71794efc129'),
    'public.get_my_company_id()',            jsonb_build_array('f873454c685a677923347603a3510190', '802d0ceb25cc735d1916beccff7e91d5'),
    'public.e_amministratore_di(uuid)',      jsonb_build_array('55463f059e9f657ca8d2b28f9ee5479e', '7ab8c30a4bd5da0da1095723a3d71c99'),
    'public.utente_e_cliente_esterno()',     jsonb_build_array('b56132cebbc560a1e5847014cb0f3017', '56cca5c887262728457f60043c32768e'),
    'public.is_super_admin(uuid)',           jsonb_build_array('54a19e4cce7bb09e45b8d50ba788ad8c', '23d8f86c6a793f16c3e8273a711de064'),
    'public.solo_assegnati_attivo()',        jsonb_build_array('dc95539fb6a098464be74f01991728bf', 'ed99d782cf3cf467f686ee7e623cceb5'));
  v_firma text;
  v_impronta text;
begin
  for v_firma in select jsonb_object_keys(v_attese) loop
    select md5(p.prosrc) into v_impronta
      from pg_proc p
     where p.oid = v_firma::regprocedure;
    if not (v_attese -> v_firma) ? v_impronta then
      raise exception 'Funzione % cambiata dopo il censimento del 12/10/2026 (impronta %): rivedere prima di convertirla', v_firma, v_impronta;
    end if;
  end loop;
end $$;

-- Chiamante anonimo: nessun utente e ruolo «anon» nel token.
CREATE OR REPLACE FUNCTION public.chiamante_anonimo()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN auth.uid() IS NULL
     AND coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'anon';
END;
$function$;

CREATE OR REPLACE FUNCTION public.utente_bloccato()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND coalesce(is_blocked, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.chiamante_anonimo() THEN
    RETURN false;
  END IF;
  IF public.utente_bloccato() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.chiamante_anonimo() THEN
    RETURN NULL;
  END IF;
  IF public.utente_bloccato() THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT company_id FROM public.profiles WHERE id = _user_id);
END;
$function$;

-- L'azienda in cui si sta lavorando: impersonificazione attiva, poi l'azienda
-- scelta (se è la propria o una con accesso attivo), poi quella del profilo.
CREATE OR REPLACE FUNCTION public.get_effective_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE(
    (SELECT ai.target_company_id
       FROM public.active_impersonations ai
      WHERE ai.admin_user_id = auth.uid()
        AND ai.expires_at > now()
      ORDER BY ai.created_at DESC
      LIMIT 1),
    (SELECT acs.company_id
       FROM public.active_company_selection acs
      WHERE acs.user_id = auth.uid()
        AND (
          acs.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.multi_company_access mca
            WHERE mca.user_id = auth.uid()
              AND mca.company_id = acs.company_id
              AND mca.status = 'active'
              AND (mca.expires_at IS NULL OR mca.expires_at > now())
          )
        )
      LIMIT 1),
    (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.get_effective_company_id();
END;
$function$;

-- Amministratore di questa azienda: ruolo company_admin nella propria azienda
-- oppure accesso multi-azienda attivo da amministratore. Un solo EXISTS: si
-- può chiamare anche dalle funzioni che le policy valutano riga per riga.
CREATE OR REPLACE FUNCTION public.e_amministratore_di(p_azienda uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN p_azienda IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND NOT coalesce(p.is_blocked, false)
       AND (
         (p.company_id = p_azienda
          AND EXISTS (SELECT 1 FROM public.user_roles r
                       WHERE r.user_id = p.id AND r.role = 'company_admin'::public.app_role))
         OR EXISTS (SELECT 1 FROM public.multi_company_access m
                     WHERE m.user_id = p.id
                       AND m.company_id = p_azienda
                       AND m.access_role = 'company_admin'
                       AND m.status = 'active'
                       AND (m.expires_at IS NULL OR m.expires_at > now()))
       )
  );
END;
$function$;

-- Cliente esterno: ha il ruolo customer e nessun altro ruolo.
CREATE OR REPLACE FUNCTION public.utente_e_cliente_esterno()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid() AND ur.role <> 'customer'::public.app_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user_id AND role = 'super_admin'
  );
END;
$function$;

-- «Vede solo i propri»: vale per lo staff con only_assigned nell'azienda in cui
-- lavora. Il super admin e l'amministratore di quell'azienda vedono tutto.
CREATE OR REPLACE FUNCTION public.solo_assegnati_attivo()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_azienda uuid;
BEGIN
  IF public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN false;
  END IF;
  v_azienda := public.get_effective_company_id();
  IF public.e_amministratore_di(v_azienda) THEN
    RETURN false;
  END IF;
  RETURN COALESCE(
    (SELECT bool_or(sp.only_assigned)
       FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.company_id = v_azienda),
    false
  );
END;
$function$;

-- has_permission, has_permission_for_company, aziende_con_permesso: la
-- colonna del permesso si cerca in pg_attribute. Si sostituisce solo quel
-- pezzo, sul testo attuale della funzione.
do $$
declare
  v_firma text;
  v_def text;
  v_nuova text;
  v_trovati int;
  v_vecchio constant text := 'information_schema\.columns\s+where\s+table_schema\s*=\s*''public''\s+and\s+table_name\s*=\s*''staff_permissions''\s+and\s+column_name\s*=\s*_permission';
  v_pezzo constant text := 'pg_catalog.pg_attribute a WHERE a.attrelid = ''public.staff_permissions''::regclass AND a.attname = _permission AND a.attnum > 0 AND NOT a.attisdropped';
begin
  foreach v_firma in array array[
    'public.has_permission(uuid,text)',
    'public.has_permission_for_company(uuid,text,uuid)',
    'public.aziende_con_permesso(text)'
  ] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if v_def ~* 'pg_catalog\.pg_attribute a WHERE a\.attrelid = ''public\.staff_permissions''::regclass' then
      continue;  -- già fatta
    end if;
    select count(*) into v_trovati from regexp_matches(v_def, v_vecchio, 'gi');
    if v_trovati <> 1 then
      raise exception 'In % il controllo della colonna compare % volte (atteso 1): rivedere a mano', v_firma, v_trovati;
    end if;
    v_nuova := regexp_replace(v_def, v_vecchio, v_pezzo, 'i');
    execute v_nuova;
  end loop;
end $$;
