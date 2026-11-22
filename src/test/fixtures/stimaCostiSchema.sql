-- Schema minimo delle sorgenti lette dalla stima, con consuntivi dimostrativi.
create role anon;
create role authenticated;
create schema auth;
create schema private;
grant usage on schema auth, private to authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function public.utente_bloccato() returns boolean language sql stable as $$
  select coalesce(current_setting('test.negato', true) = 'bloccato', false)
$$;
create function public.e_solo_campo() returns boolean language sql stable as $$
  select coalesce(current_setting('test.negato', true) = 'campo', false)
$$;
create function public.utente_e_cliente_esterno() returns boolean language sql stable as $$
  select coalesce(current_setting('test.negato', true) = 'cliente', false)
$$;
create function public.user_can_access_company(p_azienda uuid) returns boolean language sql stable as $$
  select p_azienda::text = current_setting('test.azienda', true)
$$;
create function public.has_permission_for_company(p_user uuid, permesso text, p_azienda uuid)
returns boolean language sql stable as $$
  select p_user is not null and public.user_can_access_company(p_azienda)
    and coalesce(current_setting('test.negato', true), '') <> permesso
$$;
create function public.resolve_company_feature(uuid, text) returns table(is_enabled boolean, access_level text)
language sql stable as $$
  select coalesce(current_setting('test.negato', true), '') <> 'feature', 'enabled'::text
$$;
create table public.orders (
  id uuid primary key, company_id uuid, deleted_at timestamptz, quote_id uuid, order_code text, tipo_lavoro text,
  distanza_sede_km numeric, total_amount numeric, visibile boolean not null default true
);
create function private.office_order_rights(p_order uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('costs', true, 'margins', true,
    'amounts', public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', o.company_id))
  from public.orders o where o.visibile and o.id = p_order and public.user_can_access_company(o.company_id)
$$;
create table public.order_work_phases (id uuid primary key, order_id uuid, company_id uuid, status text, completata_il timestamptz);
create table public.order_work_subphases (id uuid primary key, phase_id uuid, quantita_fatta numeric, fatta boolean, fatta_il timestamptz);
create table public.order_work_phase_voci (
  id uuid primary key, order_id uuid, company_id uuid, phase_id uuid, subphase_id uuid, descrizione text,
  origine_codice text, tariffa_id uuid, unita text, quantita numeric
);
create table private.office_order_economics_base (
  id uuid primary key, company_id uuid, costo_acquisti numeric, costo_materiali_magazzino numeric, costo_manodopera numeric,
  movimenti_magazzino_senza_costo bigint default 0, numero_rimborsi_km_da_approvare bigint default 0
);
create table public.order_employees (order_id uuid, hours_worked numeric, total_cost numeric);
create table public.order_external_teams (order_id uuid, total_cost numeric);
create table public.hr_rimborsi_km (company_id uuid, order_id uuid, km numeric, importo numeric, stato text);
create table public.suppliers (id uuid, company_id uuid, tipo text, subappaltatore_id uuid);
create table public.company_costs (
  company_id uuid, order_id uuid, supplier_id uuid, category text, name text, mezzo_id uuid, amount numeric,
  annullato_il timestamptz, allocations jsonb, purchase_order_id uuid, order_external_team_id uuid
);
create table public.purchase_orders (
  id uuid, company_id uuid, order_id uuid, status text, sent_at timestamptz, actual_delivery_date date
);
create table public.campo_rapportini (
  order_id uuid, company_id uuid, data_lavoro date, stato text, annullato_at timestamptz, role_type text, fasi_lavorate jsonb
);
create table public.purchase_order_items (purchase_order_id uuid, company_id uuid, price_pending boolean, description text);
create table public.contratti_subappalto (company_id uuid, order_id uuid, stato text);
create table private.sal_demo (order_id uuid, costo_maturato numeric);
create function private.sal_sub_da_fatturare(p_order uuid) returns numeric language sql stable as $$
  select costo_maturato from private.sal_demo where order_id = p_order
$$;

create function public.id_storico_demo(ramo int, progressivo int) returns uuid language sql immutable as $$
  select (lpad(ramo::text, 8, '0') || '-0000-4000-8000-' || lpad(progressivo::text, 12, '0'))::uuid
$$;
insert into public.orders (id, company_id, quote_id, order_code, tipo_lavoro, distanza_sede_km, total_amount, visibile)
select id_storico_demo(21000000, i), '10000000-0000-4000-8000-000000000001',
  case when i = 8 then '10000000-0000-4000-8000-000000000002'::uuid end,
  'DEMO-CHIUSA-' || lpad(i::text, 2, '0'), 'Serramenti', 12 + i * 3, (8 + i) * (320 + 5 * i), i <> 7
from generate_series(1, 8) i;
insert into public.order_work_phases
select id_storico_demo(21100000, i), id, company_id, 'completata', timestamp '2026-05-15 08:00' + i * interval '12 days'
from public.orders cross join generate_series(1, 8) i where id = id_storico_demo(21000000, i);
insert into public.order_work_subphases
select id_storico_demo(21200000, i), id_storico_demo(21100000, i), 8 + i, true, timestamp '2026-05-15 08:00' + i * interval '12 days'
from generate_series(1, 8) i;
insert into public.order_work_phase_voci
select id_storico_demo(21300000, i), id, company_id, id_storico_demo(21100000, i), id_storico_demo(21200000, i),
  'Fornitura e posa di serramenti', 'SERR-01', null, 'pz', 8 + i
from public.orders cross join generate_series(1, 8) i where id = id_storico_demo(21000000, i);
insert into private.office_order_economics_base (id, company_id, costo_acquisti, costo_materiali_magazzino, costo_manodopera)
select id, company_id, (8 + i) * (144 + i * 2), (8 + i) * 8,
  case when i in (1,2,3,4,7,8) then (8 + i) * 30 end
    + case when i in (1,2,3,7,8) then (8 + i) * 21 else 0 end
from public.orders cross join generate_series(1, 8) i where id = id_storico_demo(21000000, i);
update private.office_order_economics_base set costo_manodopera = 0 where costo_manodopera is null;
insert into public.order_employees
select id_storico_demo(21000000, i), 8 + i, (8 + i) * 30 from generate_series(1, 8) i where i not in (5, 6);
insert into public.order_external_teams
select id_storico_demo(21000000, i), (8 + i) * 21 from generate_series(1, 8) i where i not in (4, 5, 6);
insert into private.sal_demo values (id_storico_demo(21000000, 1), 65);
insert into public.hr_rimborsi_km
select company_id, id, distanza_sede_km * 4, distanza_sede_km * 4 * 0.58, 'rimborsato' from public.orders;
insert into public.suppliers values
  (id_storico_demo(21400000, 1), '10000000-0000-4000-8000-000000000001', 'subappalto', null),
  (id_storico_demo(21400000, 2), '10000000-0000-4000-8000-000000000001', 'noli_servizi', null);
insert into public.company_costs (company_id, order_id, supplier_id, category, name, amount)
select company_id, id, id_storico_demo(21400000, 1), null, 'Posa ditta', 410
from public.orders where order_code in ('DEMO-CHIUSA-05', 'DEMO-CHIUSA-06');
insert into public.company_costs (company_id, order_id, supplier_id, category, name, amount)
select company_id, id, id_storico_demo(21400000, 2), null, 'Nolo elevatore', 70 from public.orders;
insert into public.company_costs (company_id, order_id, category, name, amount)
select company_id, id, 'trasporti', 'Consegna in cantiere', 150 from public.orders;
-- Voci da non contare due volte o riferite ad altra commessa.
insert into public.company_costs (company_id, order_id, name, amount, annullato_il, order_external_team_id, allocations) values
  ('10000000-0000-4000-8000-000000000001', id_storico_demo(21000000, 1), 'Spesa annullata', 600, now(), null, null),
  ('10000000-0000-4000-8000-000000000001', id_storico_demo(21000000, 1), 'Ditta già negli affidamenti', 189, null, id_storico_demo(21500000, 1), null),
  ('10000000-0000-4000-8000-000000000001', null, 'Spese ripartite', 100, null, null,
    jsonb_build_array(jsonb_build_object('order_id', id_storico_demo(21000000, 1), 'pct', 40),
      jsonb_build_object('order_id', id_storico_demo(21000000, 2), 'pct', 60)));

insert into public.purchase_orders
select id_storico_demo(21600000, i), company_id, id, 'ricevuto',
  timestamptz '2026-05-01 10:00Z' + i * interval '12 days', date '2026-05-01' + i * 12 + 2 + i
from public.orders cross join generate_series(1, 6) i where id = id_storico_demo(21000000, i);
insert into public.campo_rapportini
select o.id, o.company_id, date '2026-05-08' + i * 12 + giorno, 'approvato', null, 'subcontractor',
  jsonb_build_array(jsonb_build_object('phase_id', id_storico_demo(21100000, i),
    'sottofasi_avanzate', jsonb_build_array(jsonb_build_object('id', id_storico_demo(21200000, i), 'quantita', 1))))
from public.orders o
cross join generate_series(1, 6) i
cross join lateral generate_series(1, least(i, 3)) giorno
where o.id = id_storico_demo(21000000, i) and i <> 4;
