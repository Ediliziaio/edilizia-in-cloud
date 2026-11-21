create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema private;
grant usage on schema auth, public, private to authenticated, anon, service_role;

create type public.app_role as enum ('employee', 'company_admin');
create table companies(id uuid primary key);
create table profiles(id uuid primary key, company_id uuid, role app_role default 'employee', bloccato boolean default false);
create table staff_permissions(
  user_id uuid, company_id uuid, only_my_warehouse boolean default false, sola_lettura boolean default false,
  can_view_warehouse boolean default false, can_edit_warehouse boolean default false, primary key(user_id, company_id)
);
create table warehouses(id uuid primary key, company_id uuid, name text, is_active boolean default true);
create table warehouse_assignments(warehouse_id uuid, user_id uuid, active boolean default true);
create table warehouse_sections(id uuid primary key, company_id uuid, warehouse_id uuid, name text);
create table warehouse_stock (
  id uuid primary key, company_id uuid, warehouse_id uuid, name text, description text, internal_code text, barcode text,
  unita_misura text, unit_cost numeric, quantity numeric, quantity_reserved numeric default 0,
  quantity_available numeric generated always as (greatest(0, quantity - quantity_reserved)) stored,
  updated_at timestamptz, section_id uuid
);
create table warehouse_movements(
  stock_item_id uuid, movement_type text, quantity numeric, performed_by uuid,
  company_id uuid, warehouse_id uuid, order_id uuid, notes text
);
create table orders(id uuid primary key, company_id uuid, order_code text, description text, indirizzo_lavori text,
  deleted_at timestamptz, status text);
create table order_campo_assignments(order_id uuid, user_id uuid);
create table employees(id uuid, user_id uuid);
create table order_employees(order_id uuid, employee_id uuid);
create table squadre_commesse(order_id uuid, squadra_id uuid);
create table squadre_test(squadra_id uuid, user_id uuid);
create table subappaltatori(id uuid, user_id uuid);
create table subappaltatori_sicurezza(id uuid, order_id uuid, campo_subappaltatore_id uuid);
create table contratti_subappalto(order_id uuid, subappaltatore_id uuid, stato text);
create table external_teams(id uuid, subappaltatore_id uuid);
create table order_external_teams(order_id uuid, external_team_id uuid);

create function auth.uid() returns uuid stable language sql as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function get_my_company_id() returns uuid stable language sql as $$
  select nullif(current_setting('test.company', true), '')::uuid
$$;
create function get_user_company_id(uid uuid) returns uuid stable security definer language sql set search_path = public as $$
  select company_id from profiles where id = uid
$$;
create function utente_bloccato() returns boolean stable security definer language sql set search_path = public as $$
  select coalesce((select bloccato from profiles where id = auth.uid()), false)
$$;
create function utente_e_cliente_esterno() returns boolean stable language sql as $$ select false $$;
create function has_role(uid uuid, p_role app_role) returns boolean stable security definer language sql set search_path = public as $$
  select exists(select 1 from profiles p where p.id = uid and p.role = p_role)
$$;
create function e_amministratore_di(azienda uuid) returns boolean stable security definer language sql set search_path = public as $$
  select exists(select 1 from profiles p where p.id = auth.uid() and p.company_id = azienda and p.role = 'company_admin')
$$;
create function utente_sola_lettura(azienda uuid) returns boolean stable security definer language sql set search_path = public as $$
  select exists(select 1 from staff_permissions p where p.user_id = auth.uid() and p.company_id = azienda and p.sola_lettura)
$$;
create function has_permission_for_company(uid uuid, permesso text, azienda uuid) returns boolean stable security definer language sql set search_path = public as $$
  select e_amministratore_di(azienda) or exists(
    select 1 from staff_permissions p where p.user_id = uid and p.company_id = azienda
      and case permesso when 'can_edit_warehouse' then p.can_edit_warehouse else p.can_view_warehouse end
  )
$$;
create function has_permission(uid uuid, permesso text) returns boolean stable security definer language sql set search_path = public as $$
  select has_permission_for_company(uid, permesso, get_my_company_id())
$$;
create function get_my_warehouse_ids() returns uuid[] stable security definer language sql set search_path = public as $$
  select coalesce(array_agg(warehouse_id), array[]::uuid[]) from warehouse_assignments where user_id = auth.uid() and active
$$;
create function user_assigned_to_order(cantiere uuid) returns boolean stable security definer language sql set search_path = public as $$
  select exists(select 1 from order_campo_assignments where order_id = cantiere and user_id = auth.uid())
$$;
create function campo_mie_squadre() returns setof uuid stable security definer language sql set search_path = public as $$
  select squadra_id from squadre_test where user_id = auth.uid()
$$;

grant select on staff_permissions to authenticated;
alter table warehouse_stock enable row level security;
grant select on warehouse_stock to authenticated;
create policy stock_base on warehouse_stock for select to authenticated using (company_id = get_my_company_id());
