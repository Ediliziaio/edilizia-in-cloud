import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migrazione = (nome: string) => readFile(new URL("../../../supabase/migrations/" + nome, import.meta.url), "utf8");
export async function databaseRiservaMaterialiOperazione({ company, user, generale, ordine, fornitore, deposito, stock, articolo, unita }: {
  company: string;
  user: string;
  generale: string;
  ordine: string;
  fornitore: string;
  deposito: string;
  stock: string;
  articolo: string;
  unita: string;
}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select $1=current_setting('test.user')::uuid and $3=current_setting('test.company')::uuid$$;
    create function public.e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;
    create function public.utente_bloccato() returns boolean language sql as $$select false$$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function public.can_see_order(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
    create function public.fulfillment_status_holds_reserve(text) returns boolean language sql immutable as $$select $1='received'$$;
    create function public.unita_confrontabile(text) returns text language sql immutable as $$select case lower(trim($1)) when 'mq' then 'm²' when 'm2' then 'm²' else lower(trim($1)) end$$;
    create type public.app_role as enum('company_admin');
    create function public.has_role(uuid,app_role) returns boolean language sql as $$select false$$;
    create function public.get_user_company_id(uuid) returns uuid language sql as $$select current_setting('test.company')::uuid$$;

    create table orders(id uuid primary key,company_id uuid,commessa_generale_id uuid, workflow_kind text,
      assigned_to uuid, destination_warehouse_id uuid,deleted_at timestamptz);
    create table suppliers(id uuid primary key, company_id uuid);
    create table warehouses(id uuid primary key, company_id uuid, is_active boolean);
    create table multi_company_access(user_id uuid, company_id uuid, status text, expires_at timestamptz, access_role text);
    create table warehouse_assignments(user_id uuid, warehouse_id uuid, active boolean);
    create table warehouse_operation_requests(company_id uuid,request_id uuid,actor_id uuid,operation text,payload jsonb,response jsonb,
      primary key(company_id,request_id));
    create table warehouse_stock(id uuid primary key, company_id uuid, warehouse_id uuid, name text, unita_misura text,
      tracking_mode text default 'bulk', quantity numeric, quantity_reserved numeric default 0,
      quantity_available numeric generated always as (quantity-quantity_reserved) stored, updated_at timestamptz);
    create table order_items(id uuid primary key,order_id uuid,supplier_id uuid,name text,natura_riga text,
      stock_item_id uuid,quantity numeric not null,quantity_received numeric default 0,warehouse_reserved_quantity numeric,
      fulfillment_status text default 'not_started',status text default 'da_ordinare',unita_misura text,posizioni jsonb,
      auto_deducted boolean, supplier_rfq_item_id uuid, updated_at timestamptz,purchase_price numeric,vat_rate numeric,
      prezzo_da_definire boolean,prezzo_fonte text);
    create table purchase_orders(id uuid primary key default gen_random_uuid(),company_id uuid,supplier_id uuid,order_id uuid,
      created_by uuid,status text,oda_number text,notes text);
    create table purchase_order_items(id uuid primary key default gen_random_uuid(),company_id uuid,purchase_order_id uuid references purchase_orders,
      order_item_id uuid references order_items,description text,quantity numeric,quantity_received numeric default 0,unit_price numeric,
      vat_rate numeric,discount_percent numeric,unit_of_measure text,sort_order integer,price_pending boolean);
    create table warehouse_movements(id uuid,order_id uuid,stock_item_id uuid,order_item_id uuid,movement_type text,
      rientro_commessa boolean,quantity numeric,notes text);
    create table campo_rapportini(order_id uuid,stato text,materiali_usati jsonb);
    create table stock_units(id uuid,serial_number text,status text,delivered_to_order_id uuid);
    create table warehouse_unit_exits(stock_unit_id uuid,movement_id uuid,returned_by uuid);
    grant usage on schema auth to authenticated;
    grant select,insert,update on orders,suppliers,order_items,purchase_orders,purchase_order_items,warehouse_stock to authenticated;
  `);
  const magazzino = await migrazione("20290420125000_magazzino_flussi_transazionali.sql");
  const dalla = magazzino.indexOf("CREATE OR REPLACE FUNCTION public.warehouse_access_v2(");
  await db.exec(magazzino.slice(dalla, magazzino.indexOf("-- può portare via", dalla)));
  for (const funzione of ["warehouse_return_state_v2", "warehouse_reserve_v2"]) {
    const inizio = magazzino.lastIndexOf("CREATE OR REPLACE FUNCTION public." + funzione + "(");
    const fine = magazzino.indexOf("$$;", inizio) + 3;
    await db.exec(magazzino.slice(inizio, fine));
  }
  const acquisti = await migrazione("20281107090000_crea_commessa_preventivo_alias_famiglia.sql");
  const inizioOda = acquisti.indexOf("create or replace function public.crea_oda_materiali_atomica(");
  await db.exec(acquisti.slice(inizioOda, acquisti.indexOf("$$;", inizioOda) + 3));
  await db.exec(await migrazione("20281222210000_ordini_parziali.sql"));
  const preparazione = await migrazione("20290420110000_preparazione_forniture_atomica.sql");
  const prezzo = preparazione.indexOf("do $patch$");
  await db.exec(preparazione.slice(prezzo, preparazione.indexOf("end $patch$;", prezzo) + "end $patch$;".length));
  await db.exec(await migrazione("20290528113100_riserva_materiali_operazione.sql"));

  await db.query("select set_config('test.actor',$1,false),set_config('test.user',$1,false),set_config('test.company',$2,false)", [user, company]);
  await db.query("insert into orders(id,company_id,commessa_generale_id,workflow_kind) values($1,$2,null,'generale'),($3,$2,$1,'commessa')", [generale,company,ordine]);
  await db.query("insert into suppliers values($1,$2)", [fornitore,company]);
  await db.query("insert into warehouses values($1,$2,true)", [deposito,company]);
  await db.query("insert into warehouse_assignments values($1,$2,true)", [user,deposito]);
  await db.query("insert into warehouse_stock(id,company_id,warehouse_id,name,unita_misura,quantity) values($1,$2,$3,'Gres demo',$4,37)", [stock,company,deposito,unita]);
  await db.query("insert into order_items(id,order_id,supplier_id,name,natura_riga,quantity,unita_misura,purchase_price,vat_rate) values($1,$2,$3,'Gres demo','materiale',74,$4,10,22)", [articolo,ordine,fornitore,unita]);
  return db;
}
