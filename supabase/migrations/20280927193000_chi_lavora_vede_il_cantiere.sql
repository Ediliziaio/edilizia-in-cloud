-- Chi lavora sulla commessa la vede nell'app, con le sue date (26/09/2026).
--
-- Richiesta del founder: l'accesso all'app non è una cosa a parte. Chi lavora
-- sulla commessa — una squadra, una persona o una ditta messa su una fase — la
-- trova nell'app da solo, dal primo all'ultimo giorno delle sue fasi.
--
-- Prima solo le squadre davano l'accesso in automatico (squadra_allinea_accessi).
-- Una persona messa su una fase riceveva, dal browser e solo a volte, una riga
-- senza date; una ditta niente. Ora un'unica funzione per commessa,
-- commessa_allinea_accessi(), mette insieme le tre fonti e tiene in pari le
-- righe automatiche di order_campo_assignments:
--   · da_squadra_id  → la dà una squadra (come prima);
--   · da_lavori      → la dà una riga di lavoro (order_employees o
--                      order_external_teams), con le date della fase.
-- Le righe date a mano (entrambi vuoti) non si toccano mai.
--
-- Scatta da sola: persone e ditte aggiunte, tolte o spostate di fase, date
-- della fase cambiate, account collegato a un operaio. squadra_allinea_accessi
-- resta con lo stesso nome (la chiamano tutte le RPC delle squadre) e ora
-- riallinea le commesse della squadra.
--
-- Più commessa_capocantiere(): il capocantiere si sceglie fra chi lavora qui,
-- direttamente in «Lavori e squadre».

alter table public.order_campo_assignments
  add column if not exists da_lavori boolean not null default false;
comment on column public.order_campo_assignments.da_lavori is
  'Accesso dato dal lavoro sulla commessa (persona o ditta in order_employees/order_external_teams): lo tiene in pari commessa_allinea_accessi. Con da_squadra_id vuoto e questo false, è dato a mano e non si tocca.';

-- ── 1. Chi deve vedere la commessa, e da quando a quando ────────────────────
create or replace function public.commessa_accessi_voluti(p_order_id uuid)
returns table (user_id uuid, company_id uuid, role_type text, dal date, al date,
               squadra_id uuid, da_lavori boolean, capocantiere boolean)
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select id, company_id from public.orders where id = p_order_id
  ),
  fonti as (
    -- Le squadre (tutta la commessa o una fase): componenti e responsabile.
    select h.user_id, 'employee'::text as ruolo, sc.dal, sc.al, sc.squadra_id,
           false as persona, (h.id = t.responsabile_hr_profilo_id and sc.capocantiere) as capo
      from public.squadre_commesse sc
      join o on o.id = sc.order_id
      join public.external_teams t on t.id = sc.squadra_id and t.is_active
      join public.hr_profili h
        on h.company_id = sc.company_id
       and h.user_id is not null
       and coalesce(h.attivo, true)
       and (h.id = t.responsabile_hr_profilo_id
            or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
    union all
    -- Le persone messe su una fase (o su tutta la commessa, senza fase).
    select e.user_id, 'employee', ph.start_date, ph.end_date, null::uuid, true, false
      from public.order_employees oe
      join o on o.id = oe.order_id
      join public.employees e on e.id = oe.employee_id and e.user_id is not null and coalesce(e.is_active, true)
      left join public.order_work_phases ph on ph.id = oe.phase_id
    union all
    -- Le ditte che hanno un referente con l'app.
    select coalesce(t.leader_user_id, s.user_id), 'subcontractor', ph.start_date, ph.end_date, null::uuid, true, false
      from public.order_external_teams ot
      join o on o.id = ot.order_id
      join public.external_teams t on t.id = ot.external_team_id and t.is_active and t.kind is distinct from 'interna'
      left join public.subappaltatori s on s.id = t.subappaltatore_id and coalesce(s.is_active, true)
      left join public.order_work_phases ph on ph.id = ot.phase_id
     where coalesce(t.leader_user_id, s.user_id) is not null
  )
  select f.user_id, o.company_id,
         case when bool_or(f.ruolo = 'employee') then 'employee' else 'subcontractor' end,
         case when bool_or(f.dal is null) then null else min(f.dal) end,
         case when bool_or(f.al is null) then null else max(f.al) end,
         (array_agg(f.squadra_id order by f.squadra_id) filter (where f.squadra_id is not null))[1],
         bool_or(f.persona),
         bool_or(f.capo)
    from fonti f
    cross join o
   where public.account_della_azienda(f.user_id, o.company_id)
   group by f.user_id, o.company_id
$$;
revoke all on function public.commessa_accessi_voluti(uuid) from public, anon, authenticated;

-- ── 2. Tenere in pari le righe automatiche di una commessa ──────────────────
create or replace function public.commessa_allinea_accessi(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if p_order_id is null then
    return;
  end if;

  -- Via chi non lavora più qui.
  delete from public.order_campo_assignments a
   where a.order_id = p_order_id
     and (a.da_squadra_id is not null or a.da_lavori)
     and not exists (select 1 from public.commessa_accessi_voluti(p_order_id) v where v.user_id = a.user_id);

  -- Le date seguono le fasi e le squadre.
  update public.order_campo_assignments a
     set data_inizio = v.dal,
         data_fine_prevista = v.al,
         da_squadra_id = v.squadra_id,
         da_lavori = v.da_lavori
    from public.commessa_accessi_voluti(p_order_id) v
   where a.order_id = p_order_id
     and a.user_id = v.user_id
     and (a.da_squadra_id is not null or a.da_lavori)
     and (a.data_inizio is distinct from v.dal
          or a.data_fine_prevista is distinct from v.al
          or a.da_squadra_id is distinct from v.squadra_id
          or a.da_lavori is distinct from v.da_lavori);

  -- Dentro chi manca, se il suo lavoro non è già finito. Un accesso dato a
  -- mano alla stessa persona resta com'è. Un solo capocantiere per commessa.
  with voluti as (
    select * from public.commessa_accessi_voluti(p_order_id)
  ),
  capo as (
    select v.user_id from voluti v where v.capocantiere order by v.user_id limit 1
  )
  insert into public.order_campo_assignments
    (company_id, order_id, user_id, role_type, assigned_by, data_inizio, data_fine_prevista,
     is_capocantiere, note, da_squadra_id, da_lavori)
  select v.company_id, p_order_id, v.user_id, v.role_type, auth.uid(), v.dal, v.al,
         (v.user_id = (select c.user_id from capo c)
          and not exists (select 1 from public.order_campo_assignments x
                           where x.order_id = p_order_id and x.is_capocantiere)),
         case when v.squadra_id is not null then 'Con la squadra' else 'Dalle fasi di lavoro' end,
         v.squadra_id, v.da_lavori
    from voluti v
   where v.al is null or v.al >= v_oggi
  on conflict (order_id, user_id) do nothing;
end;
$$;
revoke all on function public.commessa_allinea_accessi(uuid) from public, anon, authenticated;

-- ── 3. La squadra riallinea le sue commesse ─────────────────────────────────
create or replace function public.squadra_allinea_accessi(p_squadra_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o uuid;
begin
  if p_squadra_id is null then
    return;
  end if;
  for v_o in
    select sc.order_id from public.squadre_commesse sc where sc.squadra_id = p_squadra_id
    union
    select a.order_id from public.order_campo_assignments a where a.da_squadra_id = p_squadra_id
  loop
    perform public.commessa_allinea_accessi(v_o);
  end loop;
end;
$$;
revoke all on function public.squadra_allinea_accessi(uuid) from public, anon, authenticated;

-- ── 4. Quando scatta ────────────────────────────────────────────────────────
-- Persone e ditte aggiunte, tolte, spostate di fase.
create or replace function public.lavoro_commessa_allinea_accessi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.commessa_allinea_accessi(old.order_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.order_id is distinct from old.order_id) then
    perform public.commessa_allinea_accessi(new.order_id);
  end if;
  return null;
end;
$$;
revoke all on function public.lavoro_commessa_allinea_accessi() from public, anon, authenticated;

drop trigger if exists trg_persona_lavoro_accessi on public.order_employees;
create trigger trg_persona_lavoro_accessi
  after insert or delete or update of employee_id, phase_id, order_id on public.order_employees
  for each row execute function public.lavoro_commessa_allinea_accessi();

drop trigger if exists trg_ditta_lavoro_accessi on public.order_external_teams;
create trigger trg_ditta_lavoro_accessi
  after insert or delete or update of external_team_id, phase_id, order_id on public.order_external_teams
  for each row execute function public.lavoro_commessa_allinea_accessi();

-- Le date della fase: prima trascinano le squadre che la seguono, poi tutta
-- la commessa si riallinea una volta sola (persone e ditte comprese).
create or replace function public.fase_date_alle_squadre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.start_date is not distinct from old.start_date and new.end_date is not distinct from old.end_date then
    return new;
  end if;
  update public.squadre_commesse
     set dal = new.start_date, al = new.end_date
   where phase_id = new.id and segue_fase;
  perform public.commessa_allinea_accessi(new.order_id);
  return new;
end;
$$;
revoke all on function public.fase_date_alle_squadre() from public, anon, authenticated;

-- Un operaio che riceve l'account (o torna attivo) trova subito i suoi cantieri.
create or replace function public.dipendente_account_allinea_accessi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o uuid;
begin
  if new.user_id is not distinct from old.user_id and new.is_active is not distinct from old.is_active then
    return null;
  end if;
  for v_o in
    select oe.order_id from public.order_employees oe where oe.employee_id = new.id
    union
    select a.order_id from public.order_campo_assignments a
     where a.user_id in (old.user_id, new.user_id) and a.da_lavori
  loop
    perform public.commessa_allinea_accessi(v_o);
  end loop;
  return null;
end;
$$;
revoke all on function public.dipendente_account_allinea_accessi() from public, anon, authenticated;
drop trigger if exists trg_dipendente_account_accessi on public.employees;
create trigger trg_dipendente_account_accessi
  after update of user_id, is_active on public.employees
  for each row execute function public.dipendente_account_allinea_accessi();

-- Lo stesso per chi è in squadra: la scheda del Personale riceve l'account.
create or replace function public.scheda_account_allinea_accessi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s uuid;
begin
  if new.user_id is not distinct from old.user_id and new.attivo is not distinct from old.attivo then
    return null;
  end if;
  for v_s in
    select c.squadra_id from public.squadre_componenti c where c.hr_profilo_id = new.id
    union
    select t.id from public.external_teams t where t.responsabile_hr_profilo_id = new.id
  loop
    perform public.squadra_allinea_accessi(v_s);
  end loop;
  return null;
end;
$$;
revoke all on function public.scheda_account_allinea_accessi() from public, anon, authenticated;
drop trigger if exists trg_scheda_account_accessi on public.hr_profili;
create trigger trg_scheda_account_accessi
  after update of user_id, attivo on public.hr_profili
  for each row execute function public.scheda_account_allinea_accessi();

-- ── 5. Il capocantiere, scelto fra chi lavora qui ───────────────────────────
create or replace function public.commessa_capocantiere(p_order_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_edit_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi scegliere il capocantiere di questa commessa.';
  end if;

  update public.order_campo_assignments
     set is_capocantiere = false
   where order_id = p_order_id and is_capocantiere and user_id is distinct from p_user_id;

  if p_user_id is null then
    return;
  end if;

  -- Chi lavora qui ma non ha ancora la riga (lavoro segnato prima di oggi).
  perform public.commessa_allinea_accessi(p_order_id);

  update public.order_campo_assignments
     set is_capocantiere = true
   where order_id = p_order_id and user_id = p_user_id and role_type = 'employee';
  if not found then
    raise exception using errcode = '22023', message = 'Questa persona non lavora su questa commessa, o non ha l''app.';
  end if;
end;
$$;
revoke all on function public.commessa_capocantiere(uuid, uuid) from public, anon;
grant execute on function public.commessa_capocantiere(uuid, uuid) to authenticated;

-- ── 6. Le commesse aperte si mettono in pari adesso ─────────────────────────
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $$
declare
  v_o uuid;
begin
  for v_o in
    select distinct o.id
      from public.orders o
     where o.deleted_at is null
       and coalesce(o.status, '') not in ('completato', 'annullato', 'chiuso')
       and (exists (select 1 from public.order_employees oe join public.employees e on e.id = oe.employee_id
                     where oe.order_id = o.id and e.user_id is not null)
            or exists (select 1 from public.order_external_teams ot join public.external_teams t on t.id = ot.external_team_id
                        where ot.order_id = o.id and t.leader_user_id is not null)
            or exists (select 1 from public.squadre_commesse sc where sc.order_id = o.id))
  loop
    perform public.commessa_allinea_accessi(v_o);
  end loop;
end;
$$;
