-- Personale e ditte della commessa senza costi, per l'ufficio senza permesso (08/11/2026).
--
-- Stesso schema delle righe commessa: viste con le stesse colonne e i costi vuoti, visibilità
-- copiata dalle regole della tabella, e costi che restano quelli di prima su una PATCH di chi
-- non li vede (la riceve vuota e la riscriverebbe). `order_work_phase_voci` non serve: le sue
-- regole chiedono già `can_view_costs`.
--
-- Nessuna riga viene scritta. Il blocco sulle tabelle sta in una migrazione successiva.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  t record;
  v_lista text;
begin
  for t in select * from (values
    ('order_employees', array['hourly_rate','total_cost','cost_preventivo','planned_hourly_rate'],
     $w$ ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role)) and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid()))))
         or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
         or exists (select 1 from public.employees e where e.id = order_employees.employee_id and e.user_id = (select auth.uid()))
         or ((select public.has_permission((select auth.uid()), 'can_view_orders')) and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
             and exists (select 1 from public.orders o where o.id = order_employees.order_id)) $w$),
    ('order_external_teams', array['total_cost','cost_preventivo','costo_unitario'],
     $w$ ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
           and exists (select 1 from public.orders o where o.id = order_external_teams.order_id and o.company_id = (select public.get_user_company_id((select auth.uid())))))
         or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
         or ((select public.has_permission((select auth.uid()), 'can_view_orders'))
             and exists (select 1 from public.orders o where o.id = order_external_teams.order_id and o.company_id = (select public.get_user_company_id((select auth.uid()))))) $w$)
  ) as v(tabella, costi, filtro) loop
    select string_agg(case when a.attname = any(t.costi)
                           then format('null::%s as %I', format_type(a.atttypid, a.atttypmod), a.attname)
                           else format('%I.%I', t.tabella, a.attname) end, ', ' order by a.attnum)
      into v_lista
      from pg_attribute a
     where a.attrelid = format('public.%I', t.tabella)::regclass and a.attnum > 0 and not a.attisdropped;

    execute format('create or replace view public.%I with (security_barrier = true) as select %s from public.%I %I where not (select public.utente_bloccato()) and (%s)',
      t.tabella || '_senza_prezzi', v_lista, t.tabella, t.tabella, t.filtro);
    execute format('revoke all on public.%I from public, anon', t.tabella || '_senza_prezzi');
    execute format('grant select on public.%I to authenticated', t.tabella || '_senza_prezzi');
  end loop;
end
$migrazione$;

create or replace function public.order_employees_costi_protetti()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_setting('request.path', true) = '/order_employees' and public.utente_senza_costi_ufficio() then
    new.hourly_rate := old.hourly_rate;
    new.total_cost := old.total_cost;
    new.cost_preventivo := old.cost_preventivo;
    new.planned_hourly_rate := old.planned_hourly_rate;
  end if;
  return new;
end;
$function$;
revoke all on function public.order_employees_costi_protetti() from public, anon, authenticated;
drop trigger if exists a_oe_costi_protetti on public.order_employees;
create trigger a_oe_costi_protetti before update on public.order_employees
  for each row execute function public.order_employees_costi_protetti();

create or replace function public.order_external_teams_costi_protetti()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_setting('request.path', true) = '/order_external_teams' and public.utente_senza_costi_ufficio() then
    new.total_cost := old.total_cost;
    new.cost_preventivo := old.cost_preventivo;
    new.costo_unitario := old.costo_unitario;
  end if;
  return new;
end;
$function$;
revoke all on function public.order_external_teams_costi_protetti() from public, anon, authenticated;
drop trigger if exists a_oet_costi_protetti on public.order_external_teams;
create trigger a_oet_costi_protetti before update on public.order_external_teams
  for each row execute function public.order_external_teams_costi_protetti();
