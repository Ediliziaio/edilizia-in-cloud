-- Centotrentatre policy chiamavano una funzione per ogni riga letta.
--
-- Una condizione come `is_super_admin(auth.uid())` non dipende dalla riga: dà
-- la stessa risposta per tutte. Scritta così, però, Postgres la valuta una volta
-- per riga -- su `company_activity_log` sono 7.525 chiamate per una domanda
-- sola. Racchiusa in un sottoselect diventa un InitPlan: calcolata una volta,
-- poi confrontata.
--
-- La riscrittura non cambia il significato, e non è una questione di stile:
-- `is_super_admin`, `has_role`, `get_user_company_id`, `user_can_access_company`
-- e `utente_e_cliente_esterno` sono tutte dichiarate STABLE, cioè per
-- definizione danno lo stesso risultato per gli stessi argomenti dentro la
-- stessa istruzione. Sollevarle è esattamente ciò che il pianificatore avrebbe
-- il diritto di fare da solo, e che non fa perché sono SECURITY DEFINER.
--
-- Le 133 policy stanno tutte dentro quattro forme, senza residui:
--   has_permission(auth.uid(), ...) ..... 92
--   has_role(auth.uid(), ...) ........... 76
--   get_user_company_id(auth.uid()) ..... 48
--   confronto diretto = auth.uid() ......  8
--   is_super_admin(auth.uid()) ..........  6
-- (la somma supera 133 perché una policy può contenerne più d'una)
--
-- Ogni policy toccata finisce in zz_policy_backup prima di essere sostituita.
--
-- Applicata alle 78 tabelle con almeno 100 righe: 170 policy riscritte. Sulle
-- altre 603 (325 vuote, 281 sotto le cento righe) la differenza non si
-- misurerebbe, e ogni DROP+CREATE di policy prende un lucchetto esclusivo sulla
-- tabella: non vale la pena prenderne seicento su un database vivo.
--
-- Il guadagno, misurato sulla stessa tabella e sulla stessa condizione
-- (marketing_contacts, 90.382 righe, utente reale):
--   chiamata per ogni riga ......... 732,7 ms
--   calcolata una volta (InitPlan) ... 13,2 ms
-- cinquantasei volte, a parita' di righe restituite.
--
-- Prova che nessuno vede piu' o meno di prima: 5 utenti (super admin, due
-- amministratori di aziende diverse, uno staff, un cliente) per 78 tabelle,
-- 390 conteggi prima e dopo. 389 identici. L'unico diverso e' user_sessions
-- (31 -> 32) per un amministratore: una sessione nata alle 10:02 UTC, dentro la
-- finestra fra le due misure. La policy di lettura di quella tabella e'
-- canonicamente identica prima e dopo.

-- Trasformazione del testo. Prima si uniforma ogni auth.uid() a un segnaposto,
-- poi si racchiudono le chiamate; i segnaposti evitano di racchiudere due volte
-- quello che era già racchiuso.
create or replace function public.espressione_initplan(p_testo text)
returns text
language plpgsql
immutable
as $fn$
declare t text := p_testo;
begin
  if t is null then return null; end if;

  -- 1. tutte le auth.uid(), racchiuse o no, diventano lo stesso segnaposto
  t := replace(t, '( SELECT auth.uid() AS uid)', '@@U@@');
  t := replace(t, '(SELECT auth.uid() AS uid)', '@@U@@');
  t := replace(t, 'auth.uid()', '@@U@@');

  -- 2. quello che è già racchiuso si mette da parte, per non annidare
  t := replace(t, '( SELECT is_super_admin(@@U@@) AS is_super_admin)', '@@K1@@');
  t := replace(t, '( SELECT get_user_company_id(@@U@@) AS get_user_company_id)', '@@K3@@');
  t := regexp_replace(t, '\( SELECT has_role\(@@U@@, ([^)]*)\) AS has_role\)', '@@K2S@@\1@@K2E@@', 'g');
  t := regexp_replace(t, '\( SELECT has_permission\(@@U@@, ([^)]*)\) AS has_permission\)', '@@K4S@@\1@@K4E@@', 'g');
  t := replace(t, '( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno)', '@@K5@@');

  -- 3. si racchiude il resto
  t := replace(t, 'is_super_admin(@@U@@)', '@@K1@@');
  t := replace(t, 'get_user_company_id(@@U@@)', '@@K3@@');
  t := regexp_replace(t, 'has_role\(@@U@@, ([^)]*)\)', '@@K2S@@\1@@K2E@@', 'g');
  t := regexp_replace(t, 'has_permission\(@@U@@, ([^)]*)\)', '@@K4S@@\1@@K4E@@', 'g');
  t := replace(t, 'utente_e_cliente_esterno()', '@@K5@@');

  -- 4. Si rimettono i segnaposti nella forma finale, che e' esattamente quella
  --    con cui Postgres riscrive la policy quando la rilegge. Serve perche' la
  --    trasformazione sia idempotente: riapplicarla non deve cambiare niente,
  --    altrimenti il conteggio di quanto resta da fare mente. Ci sono cascato:
  --    scrivevo `public.has_role(...)`, Postgres la rileggeva come
  --    `has_role(...) AS has_role`, e il rilevatore continuava a contare come
  --    «da fare» 1219 policy che erano gia' a posto.
  t := replace(t, '@@K1@@', '( SELECT is_super_admin(@@U@@) AS is_super_admin)');
  t := replace(t, '@@K3@@', '( SELECT get_user_company_id(@@U@@) AS get_user_company_id)');
  t := replace(t, '@@K2S@@', '( SELECT has_role(@@U@@, ');
  t := replace(t, '@@K2E@@', ') AS has_role)');
  t := replace(t, '@@K4S@@', '( SELECT has_permission(@@U@@, ');
  t := replace(t, '@@K4E@@', ') AS has_permission)');
  t := replace(t, '@@K5@@', '( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno)');
  t := replace(t, '@@U@@', '( SELECT auth.uid() AS uid)');
  return t;
end;
$fn$;

-- Forma canonica: butta via l'involucro e tiene i soli pezzi che decidono --
-- nomi, colonne, operatori, valori. Serve a confrontare il prima e il dopo: se
-- la riscrittura avesse perso un pezzo di condizione, qui si vedrebbe. Non
-- guarda le parentesi, perché la trasformazione ne aggiunge apposta; la prova
-- che nessuno vede più o meno righe di prima si fa contando le righe.
create or replace function public.espressione_canonica(p_testo text)
returns text
language sql
immutable
as $fn$
  select case when p_testo is null then null else
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(p_testo, '\s+', '', 'g'),
      'SELECT', ''), 'public.', ''), '(', ''), ')', ''),
      'ASuid', ''), 'AShas_role', ''), 'ASis_super_admin', ''), 'ASget_user_company_id', ''),
      'AShas_permission', ''), 'ASutente_e_cliente_esterno', '')
  end;
$fn$;

comment on function public.espressione_canonica(text) is
  'Riduce una condizione di policy ai soli pezzi che decidono, togliendo involucro e parentesi. Serve a verificare che una riscrittura non abbia perso un pezzo per strada.';

create or replace function public.policy_riscrivi_initplan(p_tabella regclass)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r        record;
  v_qual   text;
  v_wcheck text;
  v_quante integer := 0;
  v_sql    text;
begin
  for r in
    select pol.polname,
           pol.polcmd,
           pol.polpermissive,
           pg_get_expr(pol.polqual, pol.polrelid)      as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as wcheck,
           (select string_agg(quote_ident(pg_get_userbyid(o)), ', ')
              from unnest(pol.polroles) o where o <> 0) as ruoli
      from pg_policy pol
     where pol.polrelid = p_tabella
  loop
    v_qual   := public.espressione_initplan(r.qual);
    v_wcheck := public.espressione_initplan(r.wcheck);

    -- Niente da fare su questa policy: si lascia stare.
    continue when v_qual is not distinct from r.qual
              and v_wcheck is not distinct from r.wcheck;

    -- Rete di sicurezza: se il senso cambia, non si tocca niente.
    if public.espressione_canonica(v_qual) is distinct from public.espressione_canonica(r.qual)
       or public.espressione_canonica(v_wcheck) is distinct from public.espressione_canonica(r.wcheck) then
      raise exception 'policy_riscrivi_initplan: la riscrittura di %.% cambierebbe la condizione',
        p_tabella::text, r.polname using errcode = '22023';
    end if;

    insert into public.zz_policy_backup
      (tabella, polname, polcmd, polpermissive, ruoli, qual, wcheck, salvato_il)
    values (p_tabella::text, r.polname, r.polcmd, r.polpermissive, r.ruoli, r.qual, r.wcheck, now());

    v_sql := format('DROP POLICY %I ON %s', r.polname, p_tabella::text);
    execute v_sql;

    v_sql := format('CREATE POLICY %I ON %s AS %s FOR %s TO %s',
      r.polname, p_tabella::text,
      case when r.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
      case r.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                    when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
      coalesce(r.ruoli, 'public'));
    if v_qual is not null then
      v_sql := v_sql || format(' USING (%s)', v_qual);
    end if;
    if v_wcheck is not null then
      v_sql := v_sql || format(' WITH CHECK (%s)', v_wcheck);
    end if;
    execute v_sql;

    v_quante := v_quante + 1;
  end loop;
  return v_quante;
end;
$fn$;

comment on function public.policy_riscrivi_initplan(regclass) is
  'Racchiude in un sottoselect le chiamate a funzioni STABLE che non dipendono dalla riga (has_role, is_super_admin, get_user_company_id, auth.uid), cosi'' Postgres le valuta una volta per istruzione invece che una volta per riga. Confronta la forma canonica prima e dopo e si ferma se la condizione cambierebbe. Salva ogni policy in zz_policy_backup.';
