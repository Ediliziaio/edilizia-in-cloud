import { readFileSync } from 'node:fs';
export const moduleMigration = readFileSync('supabase/migrations/20261015193502_moduli_commesse_e_accessi_multiazienda.sql', 'utf8') + '\n' + readFileSync('supabase/migrations/20261015193901_moduli_quantita_componenti_intere.sql', 'utf8');
export const A='20000000-0000-0000-0000-000000000001', B='20000000-0000-0000-0000-000000000002';
export const U='10000000-0000-0000-0000-000000000001', Q='30000000-0000-0000-0000-000000000001';
const uuid = new Set('company_id customer_id current_status_id assigned_to order_id status_id changed_by supplier_id stock_item_id family_id trigger_status_id salesperson_id performed_by order_item_id'.split(' '));
const text = new Set('order_code description payment_type internal_notes name status payment_method product_code measure_status label type trigger_evento commission_type movement_type notes'.split(' '));
const json = new Set(['axis_selections','misure_preventivo']);
const boolean = new Set('deposit_paid deposit_2_paid balance_paid financing_paid has_building_bonus is_paid'.split(' '));
// The generic writer below is the actual migration, not a mocked RPC. Only its
// surrounding tables/helpers are reduced to the fields exercised by these tests.
function table(name: string) {
  const cols=moduleMigration.match(new RegExp(`INSERT INTO public.${name} \\(([\\s\\S]*?)\\)\\s+VALUES`))?.[1];
  if (!cols) throw Error(`Missing insert ${name}`);
  return `create table ${name}(id uuid primary key default gen_random_uuid(),${cols.split(',').map(s=>s.trim()).map(c=>`${c} ${uuid.has(c)?'uuid':text.has(c)?'text':json.has(c)?'jsonb':boolean.has(c)?'boolean':c.endsWith('_date')?'date':'numeric'}`).join(',')});`;
}
export const moduleConversionSchema = `
create schema auth;
create role anon; create role authenticated;
create type app_role as enum ('super_admin','company_admin','company_staff');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create table profiles(id uuid primary key,company_id uuid);
create table multi_company_access(user_id uuid,company_id uuid,status text,expires_at timestamptz,access_role text);
create table staff_permissions(user_id uuid,company_id uuid,can_edit_orders boolean);
create function has_role(u uuid,r app_role) returns boolean language sql stable as $$select
 case when r='super_admin' then current_setting('test.super',true)='true'
 when r='company_admin' then current_setting('test.admin',true)='true' else true end$$;
create function get_user_company_id(u uuid) returns uuid language sql stable as $$select company_id from profiles where id=u$$;
create function get_effective_company_id() returns uuid language sql stable as $$select current_setting('test.company')::uuid$$;
create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'false')='true'$$;
create function utente_e_cliente_esterno() returns boolean language sql stable as $$select coalesce(current_setting('test.customer',true),'false')='true'$$;
create function solo_assegnati_attivo() returns boolean language sql stable as $$select current_setting('test.assigned',true)='true'$$;
create function check_staff_visibility(u uuid,c uuid) returns boolean language sql stable as $$select current_setting('test.assigned',true) is distinct from 'true' or u=c$$;
create function chiamante_anonimo() returns boolean language sql stable as $$select auth.uid() is null$$;
${readFileSync('src/test/fixtures/moduleCompanyPermission.sql','utf8')}
create function assert_permesso(p text,a text) returns void language plpgsql as $$begin
 if not has_permission_for_company(auth.uid(),p,get_effective_company_id()) then raise exception 'Permesso negato' using errcode='42501'; end if;
end$$;
create function assert_company_access(c uuid) returns void language plpgsql as $$begin
 if c is distinct from get_user_company_id(auth.uid()) and not has_role(auth.uid(),'super_admin')
 and not exists(select 1 from multi_company_access where user_id=auth.uid() and company_id=c) then raise exception 'Azienda non accessibile' using errcode='42501'; end if;
end$$;
${['orders','order_items','order_installments','order_status_history','order_salespeople','warehouse_movements'].map(table).join('\n')}
alter table orders add created_by uuid,add client_name text,add client_email text,add client_phone text,
 add indirizzo_lavori text,add work_address text,add fv_progetto_id uuid,add rst_progetto_id uuid;
create table warehouse_stock(id uuid,quantity integer);
create table order_statuses(id uuid default gen_random_uuid(),company_id uuid,is_default boolean,position integer,created_at timestamptz default now());
create table marketing_contacts(id uuid,company_id uuid,customer_profile_id uuid);
create table order_work_phases(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,name text not null,position integer,notes text,importo_venduto numeric);
create function prossimo_numero_commessa(c uuid) returns text language sql as $$select 'C-LOCALE'$$;
create table fv_progetti(id uuid primary key,company_id uuid,created_by uuid,numero text,titolo text,stato text,cliente_id uuid,
 cliente_nome text,cliente_cognome text,cliente_email text,cliente_telefono text,indirizzo text,comune text,cap text,provincia text,
 prezzo_vendita_iva_inclusa numeric,prezzo_vendita_manuale numeric,iva_aliquota numeric,ordine_id uuid,annullato boolean default false);
create table rst_progetti(id uuid primary key,company_id uuid,created_by uuid,code text,stato text,note text,cliente_id uuid,
 cliente_nome text,cliente_cognome text,cliente_email text,cliente_telefono text,cantiere_indirizzo text,cantiere_citta text,cantiere_cap text,cantiere_provincia text,
 totale numeric,totale_imponibile numeric,iva_pct numeric,prezzo_manuale numeric,ordine_id uuid);
create table fv_componenti_progetto(id uuid default gen_random_uuid(),progetto_id uuid,categoria text,descrizione text,marca text,modello text,
 quantita numeric(14,2),prezzo_unitario_netto numeric,prezzo_unitario_vendita numeric,ordinamento integer);
create table fv_servizi_progetto(id uuid default gen_random_uuid(),progetto_id uuid,tipo text,descrizione text,quantita numeric,prezzo_netto numeric,prezzo_vendita numeric,ordinamento integer);
create table fv_manodopera_progetto(id uuid default gen_random_uuid(),progetto_id uuid,descrizione text,ore numeric,tariffa_oraria_netta numeric,tariffa_oraria_vendita numeric,ordinamento integer);
create table rst_computo_voci(id uuid default gen_random_uuid(),progetto_id uuid,capitolo_nome text,descrizione text,unita_misura text,quantita numeric,
 prezzo_unitario numeric,sconto_pct numeric,importo numeric,costo_materiali numeric,costo_manodopera numeric,ordine integer);
insert into profiles values('${U}','${A}');
insert into order_statuses(company_id,is_default,position) values('${A}',true,0),('${B}',true,0);
select set_config('test.user','${U}',false),set_config('test.company','${A}',false),set_config('test.admin','true',false),set_config('test.super','false',false);
`;
export const seedModules = `
insert into rst_progetti(id,company_id,created_by,code,stato,note,totale,totale_imponibile,iva_pct,cliente_nome,cliente_cognome,cantiere_indirizzo,cantiere_citta)
values('${Q}','${A}','${U}','RST-LOCALE','accettato','Ristrutturazione appartamento',5286.87,4333.5,22,'Mario','Rossi','Via Roma 1','Torino');
insert into rst_computo_voci(progetto_id,capitolo_nome,descrizione,unita_misura,quantita,prezzo_unitario,importo,costo_materiali,costo_manodopera,ordine) values
('${Q}','Demolizioni','Rimozione pavimento','mq',50,45,2250,20,10,0),
('${Q}','Pavimenti','Posa gres','mq',85.5,30,2565,14,8,1);
insert into fv_progetti(id,company_id,created_by,numero,titolo,stato,prezzo_vendita_iva_inclusa,iva_aliquota,cliente_nome)
values('${Q}','${A}','${U}','FV-LOCALE','Impianto 6 kWp','emesso',11000,0.1,'Andrea');
insert into fv_componenti_progetto(progetto_id,categoria,descrizione,marca,modello,quantita,prezzo_unitario_netto,prezzo_unitario_vendita,ordinamento)
values('${Q}','modulo','Pannello 450 W','Marca','450',12,100,140,0);
insert into fv_servizi_progetto(progetto_id,tipo,descrizione,quantita,prezzo_netto,prezzo_vendita,ordinamento)
values('${Q}','pratica','Pratica di connessione',1,120,200,0);
insert into fv_manodopera_progetto(progetto_id,descrizione,ore,tariffa_oraria_netta,tariffa_oraria_vendita,ordinamento)
values('${Q}','Posa impianto',7.5,25,45,0);
`;
