import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
export const COMPANY = "10000000-0000-4000-8000-000000000001",
  ORDER = "10000000-0000-4000-8000-000000000002",
  OTHER_ORDER = "10000000-0000-4000-8000-000000000004",
  INVOICE = "10000000-0000-4000-8000-000000000005";
export const MATERIALS_MIGRATION =
  "supabase/migrations/20281017064500_fasi_materiali_classificazione.sql";
export async function fattureMaterialiDatabase() {
  const db = new PGlite();
  await db.exec(`create schema auth;create role anon;create role authenticated;
 create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function get_my_company_id() returns uuid language sql stable as $$select '${COMPANY}'::uuid$$;
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
 create function utente_bloccato() returns boolean language sql stable as $$select current_setting('test.blocked',true)='true'$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select current_setting('test.readonly',true)='true'$$;
 create function puo_vedere_documenti_fornitore() returns boolean language sql stable as $$select current_setting('test.documents',true)='true'$$;
 create function aziende_con_permesso(text) returns uuid[] language sql stable as $$select case when current_setting('test.permission',true)='true' then array['${COMPANY}'::uuid] else array[]::uuid[] end$$;
 create function has_permission_for_company(uuid,text,uuid) returns boolean language sql stable as $$select current_setting('test.permission',true)='true' or current_setting('test.superadmin',true)='true'$$;
 create function assert_company_access(uuid) returns void language plpgsql as $$begin if $1<>'${COMPANY}' then raise exception 'Azienda non valida';end if;end$$;
 create function can_see_order(uuid,uuid,uuid) returns boolean language sql stable as $$select current_setting('test.visible',true)='true'$$;
 create table companies(id uuid primary key);
 create table orders(id uuid primary key default gen_random_uuid(),company_id uuid,assigned_to uuid,destination_warehouse_id uuid,parent_contract_id uuid,deleted_at timestamptz,deleted_by uuid,total_amount numeric,description text,order_code text,deposit_paid boolean default false,deposit_2_paid boolean default false,balance_paid boolean default false,financing_paid boolean default false,work_start_date date,work_end_date date,created_at timestamptz default now(),customer_id uuid,percentuale_avanzamento numeric default 0);
 create table company_costs(id uuid primary key default gen_random_uuid(),company_id uuid,supplier_id uuid,purchase_order_id uuid,order_id uuid,name text,cost_type text,amount numeric,vat_rate numeric,category text,recurrence text,due_date date,is_paid boolean default false,paid_date date,notes text,allocations jsonb,updated_at timestamptz default now());
 create table fatture_ricevute(id uuid primary key,company_id uuid,updated_at timestamptz default now(),company_cost_id uuid references company_costs(id),stato text,tipo_documento text,imponibile_totale numeric,iva_totale numeric,totale_documento numeric,numero_fattura text,data_fattura date,cedente_ragione_sociale text,cedente_piva text,purchase_order_id uuid,categoria_ai text,righe jsonb);
 create table suppliers(id uuid,company_id uuid,vat_number text);
 create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),name text,description text,quantity numeric default 1,unit_price numeric,discount_percent numeric default 0,standard_cost numeric default 0,purchase_price numeric default 0,supplier_id uuid,stock_item_id uuid,status text default 'da_ordinare',position integer default 0,phase_id uuid,is_paid boolean default false,deposit_paid boolean default false,balance_paid boolean default false,quantity_received numeric default 0,quantity_reserved numeric default 0,receipt_id uuid,shipment_id uuid,installation_id uuid);
 create table order_work_phases(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,name text,position integer,status text default 'da_iniziare',percentuale integer default 0,notes text,importo_venduto numeric,start_date date,end_date date);
 create table purchase_order_items(id uuid,order_item_id uuid,purchase_order_id uuid);
 create table purchase_orders(id uuid,company_id uuid,order_id uuid,status text,subtotal numeric);
 create table warehouse_movements(order_id uuid,order_item_id uuid,movement_type text,quantity numeric,unit_cost numeric);
 create table order_employees(order_id uuid,phase_id uuid,hours_worked numeric,total_cost numeric);
 create table order_external_teams(order_id uuid,phase_id uuid,total_cost numeric);
 create table order_salespeople(order_id uuid,is_paid boolean,commission_amount numeric,deduction_amount numeric);
 create table profiles(id uuid,first_name text,last_name text);
 create table ordini_variazione(order_id uuid,status text,impatto_economico numeric);
 create table order_errors(order_id uuid,amount numeric);
 create table order_work_subphases(phase_id uuid);
 create table order_phase_assignments(phase_id uuid);
 create table squadre_commesse(phase_id uuid);
 create table note_cantiere(phase_id uuid);
 alter table ordini_variazione add work_phase_id uuid;
 create table hr_rimborsi_km(order_id uuid,importo numeric,stato text);
 create table invoices(id uuid,order_id uuid);
 create table documenti_fiscali(id uuid,ordine_id uuid,deleted_at timestamptz);
 create table fattura_ordine(ordine_id uuid);
 create table contratti_subappalto(order_id uuid);
 create table stock_units(reserved_order_id uuid,delivered_to_order_id uuid);
 create table order_installments(order_id uuid,is_paid boolean,invoice_id uuid,documento_fiscale_id uuid);
 create table campo_rapportini(order_id uuid,stato text);
 select set_config('test.user','10000000-0000-4000-8000-000000000003',false),set_config('test.permission','true',false),set_config('test.visible','true',false),set_config('test.blocked','false',false),set_config('test.readonly','false',false),set_config('test.documents','true',false);
 insert into companies values('${COMPANY}');
 insert into orders(id,company_id,total_amount,order_code,description) values('${ORDER}','${COMPANY}',3522.5,'O-0001','Cantiere Palma — copia locale'),('${OTHER_ORDER}','${COMPANY}',5000,'O-0002','Secondo cantiere di prova');
 insert into fatture_ricevute(id,company_id,stato,tipo_documento,imponibile_totale,iva_totale,totale_documento,numero_fattura,data_fattura,cedente_ragione_sociale,righe) values('${INVOICE}','${COMPANY}','letta','TD01',1000,220,1220,'FT-42','2026-10-16','Fornitore di prova','[{"descrizione":"Tubi corrugati","quantita":100,"imponibile":600,"aliquota_iva":22},{"descrizione":"Pozzetti","quantita":4,"imponibile":400,"aliquota_iva":22}]');`);
  await db.exec(readFileSync(MATERIALS_MIGRATION, "utf8"));
  await db.exec(readFileSync("supabase/migrations/20281017071500_fasi_storiche_permesso_esistente.sql", "utf8"));
  return db;
}
