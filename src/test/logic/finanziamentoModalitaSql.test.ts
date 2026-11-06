import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
let db: PGlite;
const company = "00000000-0000-4000-a000-000000000001";
const order = "00000000-0000-4000-a000-000000000002";
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`set check_function_bodies=false;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
    create function user_can_access_company(c uuid) returns boolean language sql as $$select c='${company}'::uuid$$;
    create table orders(id uuid primary key, company_id uuid, total_amount numeric, vat_rate numeric, payment_type text, financing_cost numeric,
      deleted_at timestamptz, deposit_amount numeric, deposit_2_amount numeric, financing_amount numeric, balance_amount numeric,
      deposit_paid boolean, deposit_2_paid boolean, financing_paid boolean, balance_paid boolean,
      deposit_paid_date date, deposit_2_paid_date date, financing_paid_date date, balance_paid_date date,
      deposit_expected_date date, deposit_2_expected_date date, financing_expected_date date, balance_expected_date date);
    create table order_installments(id uuid primary key default gen_random_uuid(),order_id uuid,type text,position integer,amount numeric,
      is_paid boolean default false,paid_date date,expected_date date,documento_fiscale_id uuid,invoice_id uuid);
    create table ordini_variazione(order_id uuid,status text,impatto_economico numeric,offline_signed_on date,firmato_il timestamptz,
      approval_recorded_at timestamptz,richiesto_il timestamptz,created_at timestamptz);
    create table documenti_fiscali(id uuid primary key,importo_pagato numeric);
    create function documento_stornato_totale(uuid) returns numeric language sql as $$select 0::numeric$$;
    create function rate_incassi(p_company uuid) returns table(order_id uuid,installment_id uuid,importo numeric) language sql as $$
      select r.order_id,r.installment_id,r.importo from rate_importi(p_company) r where r.is_paid $$;`);
  // Schema minimo per eseguire anche le RPC reali di scrittura, senza rete.
  await db.exec(`
    alter table orders alter column id set default gen_random_uuid();
    alter table orders add column version integer default 1, add column order_code text,
      add column customer_id uuid, add column description text, add column expected_date date,
      add column internal_notes text, add column warehouse_arrival_date date,
      add column work_start_date date, add column work_end_date date,
      add column has_building_bonus boolean, add column destination_warehouse_id uuid,
      add column assigned_to uuid, add column work_address text, add column work_description text,
      add column materials_location text, add column work_lat numeric, add column work_lng numeric,
      add column tetto_importo numeric, add column riferimento_committente text,
      add column updated_at timestamptz, add column current_status_id uuid;
    alter table order_installments add column label text, add column trigger_evento text,
      add column trigger_status_id uuid, add column giorni_preavviso integer, add column trigger_numero integer;
    create type app_role as enum ('super_admin');
    create function has_role(uuid,app_role) returns boolean language sql as $$select false$$;
    create function assert_permesso(text,text) returns void language plpgsql as $$begin return; end$$;
    create function can_see_order(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
    create function utente_bloccato() returns boolean language sql as $$select false$$;
    create function utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select false$$;
    create table profiles(id uuid,company_id uuid);
    insert into profiles values('${company}','${company}');
    create table multi_company_access(user_id uuid,company_id uuid,status text,expires_at timestamptz);
    create table order_statuses(id uuid,company_id uuid,is_default boolean,position integer,created_at timestamptz);
    insert into order_statuses values('${company}','${company}',true,0,now());
    create table order_status_history(order_id uuid,status_id uuid,changed_by uuid);
  `);
  for (const fn of ["commessa_salva", "create_order_atomic", "rate_importi", "rate_da_incassare", "cliente_rate_commesse", "silvio_tool_rate_commessa"]) {
    await db.exec(readFileSync(`src/test/fixtures/check71_prima_${fn}.sql`, "utf8"));
  }
  await db.exec(readFileSync("supabase/patches/check71_modalita_costo_finanziaria.sql", "utf8"));
}, 60000);
beforeEach(async () => {
  await db.exec(`truncate orders,order_installments,ordini_variazione,documenti_fiscali;
    insert into orders(id,company_id,total_amount,vat_rate,payment_type,financing_cost,financing_amount)
      values('${order}','${company}',10000,0,'financing',300,6000);
    insert into order_installments(order_id,type,position,amount) values
      ('${order}','deposit',0,2000),('${order}','financing',1,6000),('${order}','balance',2,0);`);
});
afterAll(async () => { await db?.close(); });
const mode = (value: string) => db.query("update orders set financing_cost_mode=$1 where id=$2", [value, order]);
const amounts = async () => (await db.query<{ type: string; importo: string }>("select type,importo from rate_importi($1) order by type", [company])).rows;
it("mantiene la regola storica senza modalità esplicita", async () => {
  expect(await amounts()).toEqual([{ type: "balance", importo: "1700.00" }, { type: "deposit", importo: "2000" }, { type: "financing", importo: "6000" }]);
});
it.each(["trattenuto", "separato"])("riconcilia rate e residuo SQL per costo %s", async value => {
  await mode(value);
  const rows = await amounts();
  expect(Number(rows[0].importo)).toBe(2000);
  expect(Number(rows[2].importo)).toBe(value === "trattenuto" ? 5700 : 6000);
  const { rows: residui } = await db.query<{ totale: string }>("select sum(residuo) totale from rate_da_incassare($1)", [company]);
  expect(Number(residui[0].totale)).toBe(value === "trattenuto" ? 9700 : 10000);
});
it("rifiuta modalità non previste senza cambiare il record", async () => {
  await expect(mode("automatico")).rejects.toThrow();
  expect((await db.query("select financing_cost_mode from orders")).rows).toEqual([{ financing_cost_mode: null }]);
});
it("non ricalcola lo storico già incassato", async () => {
  await db.exec("update order_installments set is_paid=true where type='financing'");
  await expect(mode("separato")).rejects.toThrow("incassi");
  expect(Number((await amounts())[0].importo)).toBe(1700);
});
it("blocca costi superiori all'erogazione e trattenute su più rate", async () => {
  await mode("trattenuto");
  await expect(db.exec("update orders set financing_cost=7000")).rejects.toThrow("supera");
  await expect(db.exec(`insert into order_installments(order_id,type,position,amount) values('${order}','financing',3,1000)`)).rejects.toThrow("singola erogazione");
  expect(Number((await amounts())[2].importo)).toBe(5700);
});
it("mantiene il controllo dell'azienda sulle rate", async () => {
  await expect(db.query("select * from rate_importi($1)", ["00000000-0000-4000-a000-000000000099"])).rejects.toThrow("non autorizzato");
});

it.each(["trattenuto", "separato"])("commessa_salva persiste la modalità %s e lascia invariata la quota lorda", async value => {
  await db.query("select commessa_salva($1, $2::jsonb)", [order, JSON.stringify({ financing_cost_mode: value })]);
  expect((await db.query("select financing_cost_mode,financing_amount from orders where id=$1", [order])).rows)
    .toEqual([{ financing_cost_mode: value, financing_amount: "6000" }]);
});
it.each(["trattenuto", "separato"])("create_order_atomic conserva il piano con modalità %s", async value => {
  const payload = { company_id: company, customer_id: company, description: "Prova isolata", total_amount: 10000,
    vat_rate: 0, payment_type: "financing", financing_cost: 300, financing_cost_mode: value,
    deposit_amount: 2000, financing_amount: 6000, balance_amount: 2000 };
  const rate = [{ type: "deposit", amount: 2000, position: 0 }, { type: "financing", amount: 6000, position: 1 }, { type: "balance", amount: 2000, position: 2 }];
  const result = await db.query<{ result: { id: string } }>("select create_order_atomic($1::jsonb,'[]'::jsonb,null,null,$2::jsonb) result", [JSON.stringify(payload),JSON.stringify(rate)]);
  const id = result.rows[0].result.id;
  expect((await db.query("select financing_cost_mode from orders where id=$1", [id])).rows).toEqual([{ financing_cost_mode: value }]);
  const amounts = await db.query<{ type: string; importo: string }>("select type,importo from rate_importi($1) where order_id=$2 order by type", [company,id]);
  expect(amounts.rows.map(r => Number(r.importo))).toEqual([2000,2000,value === "trattenuto" ? 5700 : 6000]);
});
it("un costo trattenuto invalido annulla l'intera creazione", async () => {
  const payload = { company_id: company, customer_id: company, total_amount: 10000, vat_rate: 0,
    payment_type: "financing", financing_cost: 7000, financing_cost_mode: "trattenuto", financing_amount: 6000 };
  await expect(db.query("select create_order_atomic($1::jsonb)", [JSON.stringify(payload)])).rejects.toThrow("supera");
  expect((await db.query<{ count: number }>("select count(*)::int count from orders")).rows[0].count).toBe(1);
});
it("la creazione rifiuta un'azienda diversa da quella autorizzata", async () => {
  await expect(db.query("select create_order_atomic($1::jsonb)", [JSON.stringify({
    company_id: "00000000-0000-4000-a000-000000000099", total_amount: 10000,
    payment_type: "financing", financing_cost_mode: "separato", financing_cost: 300,
  })])).rejects.toThrow("permesso");
  expect((await db.query<{ count: number }>("select count(*)::int count from orders")).rows[0].count).toBe(1);
});
it("la modifica della modalità rispetta il controllo di versione della commessa", async () => {
  await expect(db.query("select commessa_salva($1,$2::jsonb,null,null,null,null,99)", [order, JSON.stringify({ financing_cost_mode: "separato" })])).rejects.toThrow("versione");
  expect((await db.query("select financing_cost_mode from orders where id=$1", [order])).rows).toEqual([{ financing_cost_mode: null }]);
});
