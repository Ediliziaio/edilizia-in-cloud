-- Quarto controllo del cantiere (19/10/2026).
--
--  1. Rapportini: li legge l'ufficio con il permesso Commesse (o Personale, per le ore e i costi
--     delle persone) e solo per le commesse che segue; li cambia chi può modificare le commesse
--     che segue. Prima bastava il ruolo company_staff: «solo assegnati» leggeva e respingeva
--     rapportini di commesse altrui, e chi non vedeva le commesse ne leggeva i costi.
--  2. Fasi dell'ufficio: chi le vede nella commessa e può modificare le commesse le segna fatte.
--  3. Correzioni di timbratura: le legge l'ufficio con il permesso Commesse.
--  4. Due correzioni nello stesso giorno su cantieri diversi sono due richieste.
--  5. Ditta con contratto di subappalto attivo: entra nella squadra del cantiere (come la
--     squadra esterna), così vede il cantiere e manda il rapportino.
--  6. Cantieri oggi: solo le commesse aperte (come in Commesse), e la visibilità si calcola una
--     volta: commessa per commessa solo per chi ha «solo assegnati».
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Vede tutte le commesse dell'azienda attiva? (titolare, super admin, o permesso Commesse
-- senza «solo assegnati» né «solo il mio magazzino»). Nelle policy si usa come (select …):
-- una volta per lettura, non per riga.
create or replace function public.ufficio_vede_tutte_le_commesse()
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    or coalesce(public.e_amministratore_di(public.get_effective_company_id()), false)
    or (coalesce(public.has_permission(auth.uid(), 'can_view_orders'), false)
        and not exists (select 1 from public.staff_permissions sp
                         where sp.user_id = auth.uid() and sp.company_id = public.get_effective_company_id()
                           and (coalesce(sp.only_assigned, false) or coalesce(sp.only_my_warehouse, false)))))
$$;
revoke all on function public.ufficio_vede_tutte_le_commesse() from public, anon;
grant execute on function public.ufficio_vede_tutte_le_commesse() to authenticated;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists cr_select on public.campo_rapportini;
create policy cr_select on public.campo_rapportini for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id = (select public.get_my_company_id())
        and (
          -- ufficio: chi vede le commesse, per quelle che segue
          ((select coalesce(public.has_permission(auth.uid(), 'can_view_orders'), false))
           and case when (select public.ufficio_vede_tutte_le_commesse()) then true
                    else public.ufficio_vede_commessa(order_id) end)
          -- personale: ore e costi delle persone
          or (select coalesce(public.has_permission(auth.uid(), 'can_view_persone'), false))
          -- capocantiere della commessa
          or exists (select 1 from public.order_campo_assignments oca
                      where oca.order_id = campo_rapportini.order_id
                        and oca.user_id = (select auth.uid()) and oca.is_capocantiere)))
  );

drop policy if exists cr_update on public.campo_rapportini;
create policy cr_update on public.campo_rapportini for update to authenticated
  using (
    ((user_id = (select auth.uid())) and approvato = false)
    or (select public.has_role(auth.uid(), 'super_admin'::app_role))
    or (company_id = (select public.get_my_company_id())
        and (select coalesce(public.has_permission(auth.uid(), 'can_edit_orders'), false))
        and case when (select public.ufficio_vede_tutte_le_commesse()) then true
                 else public.ufficio_vede_commessa(order_id) end)
  )
  with check (
    company_id = public.get_order_company_id(order_id)
    and (((user_id = (select auth.uid())) and approvato = false)
         or (select public.has_role(auth.uid(), 'super_admin'::app_role))
         or (company_id = (select public.get_my_company_id())
             and (select coalesce(public.has_permission(auth.uid(), 'can_edit_orders'), false))
             and case when (select public.ufficio_vede_tutte_le_commesse()) then true
                      else public.ufficio_vede_commessa(order_id) end))
  );

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists fasi_ufficio_modificabili_in_commessa on public.tasks;
create policy fasi_ufficio_modificabili_in_commessa on public.tasks for update to authenticated
  using (activity_scope = 'ufficio' and order_id is not null
         and company_id = (select public.get_my_company_id())
         and (select coalesce(public.has_permission(auth.uid(), 'can_edit_orders'), false))
         and public.ufficio_vede_commessa(order_id))
  with check (activity_scope = 'ufficio' and order_id is not null
         and company_id = (select public.get_my_company_id())
         and (select coalesce(public.has_permission(auth.uid(), 'can_edit_orders'), false))
         and public.ufficio_vede_commessa(order_id));

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists correzioni_lettura on public.campo_timbrature_correzioni;
create policy correzioni_lettura on public.campo_timbrature_correzioni for select to authenticated
  using (user_id = (select auth.uid())
         or (company_id = (select public.get_my_company_id())
             and ((select public.campo_e_ufficio(campo_timbrature_correzioni.company_id))
                  or coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id), false))
             and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false)
             and (order_id is null or public.ufficio_vede_commessa(order_id))));

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_def text;
begin
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'campo_timbrature_correzioni_una_in_attesa';
  if v_def is not null and v_def not ilike '%order_id%' then
    execute 'drop index public.campo_timbrature_correzioni_una_in_attesa';
    execute replace(v_def, '(user_id, ', '(user_id, coalesce(order_id, ''00000000-0000-0000-0000-000000000000''::uuid), ');
  end if;
end $$;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.contratto_subappalto_accesso_cantiere()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  -- Il contratto vecchio (o non più attivo) toglie l'accesso che aveva dato.
  if tg_op in ('UPDATE', 'DELETE') and old.order_id is not null then
    select s.user_id into v_user from public.subappaltatori_sicurezza ss
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id where ss.id = old.subappaltatore_id;
    if v_user is not null and (tg_op = 'DELETE' or new.stato is distinct from 'attivo'
                               or new.order_id is distinct from old.order_id) then
      delete from public.order_campo_assignments
       where order_id = old.order_id and user_id = v_user and note = 'Dal contratto di subappalto';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.stato = 'attivo' and new.order_id is not null then
    select s.user_id into v_user from public.subappaltatori_sicurezza ss
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id where ss.id = new.subappaltatore_id;
    if v_user is not null then
      insert into public.order_campo_assignments
        (company_id, order_id, user_id, role_type, data_inizio, data_fine_prevista, is_capocantiere, note)
      values (new.company_id, new.order_id, v_user, 'subcontractor', new.data_inizio, new.data_fine_prevista, false,
              'Dal contratto di subappalto')
      on conflict (order_id, user_id) do nothing;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.contratto_subappalto_accesso_cantiere() from public, anon, authenticated;
drop trigger if exists trg_contratto_subappalto_accesso_cantiere on public.contratti_subappalto;
create trigger trg_contratto_subappalto_accesso_cantiere
  after insert or update of stato, order_id, subappaltatore_id or delete on public.contratti_subappalto
  for each row execute function public.contratto_subappalto_accesso_cantiere();

-- I contratti già attivi.
insert into public.order_campo_assignments
  (company_id, order_id, user_id, role_type, data_inizio, data_fine_prevista, is_capocantiere, note)
select cs.company_id, cs.order_id, s.user_id, 'subcontractor', cs.data_inizio, cs.data_fine_prevista, false,
       'Dal contratto di subappalto'
  from public.contratti_subappalto cs
  join public.subappaltatori_sicurezza ss on ss.id = cs.subappaltatore_id
  join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
  join public.orders o on o.id = cs.order_id and o.deleted_at is null
 where cs.stato = 'attivo' and s.user_id is not null
on conflict (order_id, user_id) do nothing;

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$(v_inizio timestamptz; v_fine timestamptz;)$re$,
  $to$\1
  v_tutte boolean := public.ufficio_vede_tutte_le_commesse();$to$,
  'v_tutte boolean := public.ufficio_vede_tutte_le_commesse();');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$and public\.ufficio_vede_commessa\(o\.id\)$re$,
  $to$and (v_tutte or public.ufficio_vede_commessa(o.id))$to$,
  'and (v_tutte or public.ufficio_vede_commessa(o.id))');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$and coalesce\(o\.status, ''\) not in \('completato', 'chiuso', 'annullato', 'completed', 'cancelled', 'bozza'\)$re$,
  $to$and coalesce(o.status, '') <> 'bozza'
         and public.commessa_aperta(o.company_id, o.current_status_id, o.status, o.fulfillment_status)$to$,
  'and public.commessa_aperta(o.company_id, o.current_status_id, o.status, o.fulfillment_status)');
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$(v_costi boolean;)$re$,
  $to$\1
  v_tutte boolean := public.ufficio_vede_tutte_le_commesse();$to$,
  'v_tutte boolean := public.ufficio_vede_tutte_le_commesse();');
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$public\.ufficio_vede_commessa\(o\.id\)$re$,
  $to$(v_tutte or public.ufficio_vede_commessa(o.id))$to$,
  '(v_tutte or public.ufficio_vede_commessa(o.id))');
