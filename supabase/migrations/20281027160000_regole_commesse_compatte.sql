-- Regole di lettura delle commesse più compatte (censite di nuovo il 27/10/2026).
--
-- Preparata il 12/10/2026 e non applicata. Nel frattempo, il 13/10, «le regole calcolate una volta per query» ha
-- riscritto tre delle cinque regole che questa toccava: cr_select su campo_rapportini e le due di
-- order_work_phases oggi chiamano già le funzioni una volta per query e passano da _order_visible_under_rls.
-- Quella parte è già fatta: resta fuori. Restano i due interventi ancora da fare, sulle regole rimaste come
-- erano:
--
-- 1. order_campo_assignments.oca_select chiede l'azienda dell'utente e i suoi ruoli alle funzioni
--    get_user_company_id() e has_role(), invece di una sottoquery su profiles e una su user_roles. Le sottoquery
--    leggevano solo le righe dell'utente stesso, che le regole di profiles e user_roles gli mostrano sempre:
--    stesso valore, senza espandere quelle regole (e, attraverso le assegnazioni, quelle di orders).
--    L'unica differenza possibile è per gli utenti bloccati, per cui get_user_company_id() e has_role()
--    rispondono NULL e false: su questa tabella la regola restrittiva «blocco_utente_bloccato» li esclude
--    comunque da ogni riga.
--
-- 2. order_work_subphases.sottofasi_ufficio (FOR ALL) diventa tre regole — INSERT, UPDATE e DELETE — con la
--    stessa espressione, parola per parola. In lettura non aggiungeva niente: richiede una fase visibile
--    all'utente, cioè proprio quello che chiede sottofasi_lettura, più altri vincoli. Togliendola dalla lettura,
--    il pianificatore non espande più le regole di orders per ogni sottofase: la lettura delle sottofasi come la
--    fa l'app (fasi in join) valutava le regole su TUTTE le fasi di tutte le aziende.
--
-- Perché conta: la scheda commessa interroga una ventina di tabelle legate a orders, le cui regole si richiamano
-- a vicenda (fasi -> commesse -> assegnazioni di cantiere -> profili e ruoli). Per le sottofasi il pianificatore
-- costruiva 1.709 sottopiani e impiegava 650-730 ms prima di leggere una riga; la lettura come la fa l'app
-- arrivava a 2-3,5 s per commessa.
--
-- Provato il 27/10/2026 in produzione, in transazioni annullate, SENZA creare regole: le espressioni vecchia e
-- nuova valutate come ogni utente su una copia della tabella (vedi la nota su supautils — un CREATE/ALTER
-- POLICY, anche su una copia temporanea, blocca auth fino al COMMIT).
--   · oca_select: tutti i 2.989 profili più l'anonimo, 157 righe viste in tutto → 0 differenze, anche per i
--     bloccati;
--   · sottofasi: gli 85 utenti che hanno can_edit_orders, 13.806 sottofasi viste da sottofasi_lettura → per
--     nessuno sottofasi_ufficio aggiungeva una riga in lettura.
--
-- ALTER POLICY e CREATE POLICY prendono un lock esclusivo sulle tabelle di supautils.policy_grants (auth.users,
-- auth.sessions, storage.objects…) fino alla fine della migrazione: per questo le istruzioni sono poche e
-- istantanee (tabelle da 15 e 2.781 righe), c'è lock_timeout, e si applica fuori dalla fascia 07:00-09:30 UTC.
-- Rilanciabile: ogni regola deve essere quella censita il 27/10/2026 oppure già quella nuova.

set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- Il testo delle regole (pg_get_expr) dipende dal search_path: lo stesso del censimento, così le impronte si
-- confrontano alla pari.
set local search_path = "$user", public, extensions;

do $$
declare
  -- [impronta censita il 27/10/2026, impronta nuova] di «USING|WITH CHECK» come lo scrive pg_get_expr.
  v_regole constant jsonb := jsonb_build_object(
    'order_campo_assignments|oca_select', jsonb_build_array('6bd797ab8a313d88f871b75deb70ff13', '6ee6985b8e2372aa83ff0f55f4d814df'));
  v_chiave text;
  v_tabella text;
  v_regola text;
  v_impronta text;
begin
  for v_chiave in select jsonb_object_keys(v_regole) loop
    v_tabella := split_part(v_chiave, '|', 1);
    v_regola := split_part(v_chiave, '|', 2);
    select md5(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
      into v_impronta
      from pg_policy p
     where p.polrelid = ('public.' || v_tabella)::regclass and p.polname = v_regola;
    if v_impronta is null then
      raise exception 'Regola % su % non trovata', v_regola, v_tabella;
    end if;
    if not (v_regole -> v_chiave) ? v_impronta then
      raise exception 'Regola % su % cambiata dopo il censimento del 27/10/2026 (impronta %): rivedere prima di aggiornarla', v_regola, v_tabella, v_impronta;
    end if;
  end loop;
  -- sottofasi_ufficio: quella censita, oppure già divisa nelle tre regole nuove.
  select md5(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
    into v_impronta
    from pg_policy p
   where p.polrelid = 'public.order_work_subphases'::regclass and p.polname = 'sottofasi_ufficio';
  if v_impronta is not null and v_impronta <> '5c2fa20c02e58f4b4202c4dec2018b26' then
    raise exception 'Regola sottofasi_ufficio su order_work_subphases cambiata dopo il censimento del 27/10/2026 (impronta %)', v_impronta;
  end if;
end $$;

-- Prima i lock sulle due tabelle: così la migrazione non resta a metà in coda dietro chi legge auth.users dentro
-- le regole, tenendo intanto il lock di supautils.
lock table public.order_campo_assignments, public.order_work_subphases in access exclusive mode;

-- 1. Assegnazioni di cantiere: azienda e ruoli dell'utente dalle funzioni, senza sottoquery su profiles e
--    user_roles.
alter policy oca_select on public.order_campo_assignments
  using (
    (user_id = (select auth.uid()))
    or ((company_id = (select public.get_user_company_id((select auth.uid()))))
        and ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role)
                  or public.has_role((select auth.uid()), 'company_staff'::public.app_role)
                  or public.has_role((select auth.uid()), 'super_admin'::public.app_role))
             or public.user_assigned_to_order(order_id)))
  );

-- 2. Sottofasi: l'ufficio inserisce, modifica ed elimina con la stessa regola di prima; in lettura vale
--    sottofasi_lettura. L'espressione va riscritta identica: il controllo in fondo lo verifica sul testo che
--    PostgreSQL ha salvato, non sul testo che leggiamo qui.
do $$
declare
  v_prima text;
  v_dopo text;
  v_regola text;
begin
  select pg_get_expr(p.polqual, p.polrelid) into v_prima
    from pg_policy p
   where p.polrelid = 'public.order_work_subphases'::regclass and p.polname = 'sottofasi_ufficio';

  drop policy if exists sottofasi_ufficio on public.order_work_subphases;
  drop policy if exists sottofasi_ufficio_inserisce on public.order_work_subphases;
  drop policy if exists sottofasi_ufficio_modifica on public.order_work_subphases;
  drop policy if exists sottofasi_ufficio_elimina on public.order_work_subphases;

  create policy sottofasi_ufficio_inserisce on public.order_work_subphases
    for insert to authenticated
    with check (
      (select public.has_permission((select auth.uid()), 'can_edit_orders'::text))
      and (exists (select 1
                     from public.order_work_phases f
                     join public.orders o on o.id = f.order_id
                    where f.id = order_work_subphases.phase_id
                      and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                      and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))
    );

  create policy sottofasi_ufficio_modifica on public.order_work_subphases
    for update to authenticated
    using (
      (select public.has_permission((select auth.uid()), 'can_edit_orders'::text))
      and (exists (select 1
                     from public.order_work_phases f
                     join public.orders o on o.id = f.order_id
                    where f.id = order_work_subphases.phase_id
                      and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                      and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))
    )
    with check (
      (select public.has_permission((select auth.uid()), 'can_edit_orders'::text))
      and (exists (select 1
                     from public.order_work_phases f
                     join public.orders o on o.id = f.order_id
                    where f.id = order_work_subphases.phase_id
                      and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                      and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))
    );

  create policy sottofasi_ufficio_elimina on public.order_work_subphases
    for delete to authenticated
    using (
      (select public.has_permission((select auth.uid()), 'can_edit_orders'::text))
      and (exists (select 1
                     from public.order_work_phases f
                     join public.orders o on o.id = f.order_id
                    where f.id = order_work_subphases.phase_id
                      and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                      and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))
    );

  -- Le tre regole devono dire esattamente quello che diceva sottofasi_ufficio: una virgola di differenza qui
  -- cambierebbe chi può scrivere. Se non combaciano, la migrazione si annulla.
  if v_prima is not null then
    foreach v_regola in array array['sottofasi_ufficio_inserisce', 'sottofasi_ufficio_modifica', 'sottofasi_ufficio_elimina'] loop
      select coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)) into v_dopo
        from pg_policy p
       where p.polrelid = 'public.order_work_subphases'::regclass and p.polname = v_regola;
      if v_dopo is distinct from v_prima then
        raise exception 'La regola % non dice quello che diceva sottofasi_ufficio: %  invece di  %', v_regola, v_dopo, v_prima;
      end if;
      if v_regola = 'sottofasi_ufficio_modifica' then
        select pg_get_expr(p.polwithcheck, p.polrelid) into v_dopo
          from pg_policy p
         where p.polrelid = 'public.order_work_subphases'::regclass and p.polname = v_regola;
        if v_dopo is distinct from v_prima then
          raise exception 'Il WITH CHECK di sottofasi_ufficio_modifica non dice quello che diceva sottofasi_ufficio';
        end if;
      end if;
    end loop;
  end if;
end $$;
