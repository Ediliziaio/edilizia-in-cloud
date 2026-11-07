-- Chi fa ogni sottofase (05/11/2026, richiesta di Florin). Prima «chi la fa» stava solo sulla fase: in una fase
-- con persone diverse non si poteva dire prima che le tracce le fa uno e i sanitari un altro; si vedeva dopo, dai
-- rapportini. Qui si scrive: una persona (employees) oppure una ditta o una squadra (external_teams), per sottofase.
-- Non cambia costi né accessi: quelli restano sulla fase (order_employees, order_external_teams, squadre_commesse).
-- Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.order_work_subphase_chi (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  subphase_id uuid not null references public.order_work_subphases(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  external_team_id uuid references public.external_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint order_work_subphase_chi_uno_solo check ((employee_id is null) <> (external_team_id is null))
);
create unique index if not exists order_work_subphase_chi_unico
  on public.order_work_subphase_chi (subphase_id, coalesce(employee_id, external_team_id));
create index if not exists order_work_subphase_chi_ordine on public.order_work_subphase_chi (order_id);

alter table public.order_work_subphase_chi enable row level security;
revoke all on table public.order_work_subphase_chi from public, anon;
grant select, insert, delete on table public.order_work_subphase_chi to authenticated;

-- La sottofase deve essere della commessa, e persona o ditta della stessa azienda della commessa.
create or replace function public.sottofase_chi_coerente(p_order uuid, p_sottofase uuid, p_persona uuid, p_ditta uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.order_work_subphases s join public.order_work_phases f on f.id = s.phase_id
       where s.id = p_sottofase and f.order_id = p_order)
    and (p_persona is null or exists (
      select 1 from public.employees e join public.orders o on o.company_id = e.company_id where e.id = p_persona and o.id = p_order))
    and (p_ditta is null or exists (
      select 1 from public.external_teams t join public.orders o on o.company_id = t.company_id where t.id = p_ditta and o.id = p_order));
$$;
revoke all on function public.sottofase_chi_coerente(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.sottofase_chi_coerente(uuid, uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists sottofase_chi_lettura on public.order_work_subphase_chi;
create policy sottofase_chi_lettura on public.order_work_subphase_chi for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', public.get_order_company_id(order_id))
         and public._order_visible_under_rls(order_id, false));

drop policy if exists sottofase_chi_scrittura on public.order_work_subphase_chi;
create policy sottofase_chi_scrittura on public.order_work_subphase_chi for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', public.get_order_company_id(order_id))
              and public._order_visible_under_rls(order_id, true)
              and public.sottofase_chi_coerente(order_id, subphase_id, employee_id, external_team_id));

drop policy if exists sottofase_chi_togli on public.order_work_subphase_chi;
create policy sottofase_chi_togli on public.order_work_subphase_chi for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', public.get_order_company_id(order_id))
         and public._order_visible_under_rls(order_id, true));
