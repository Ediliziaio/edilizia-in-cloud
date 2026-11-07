import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
const company = "00000000-0000-4000-a000-000000000001";
const order = "00000000-0000-4000-a000-000000000002";
const supplier = "00000000-0000-4000-a000-000000000003";
const item = "00000000-0000-4000-a000-000000000004";
const other = "00000000-0000-4000-a000-000000000099";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table orders(id uuid primary key, company_id uuid);
    create table suppliers(id uuid primary key, company_id uuid);
    create table order_items(id uuid primary key, order_id uuid, supplier_id uuid, stock_item_id uuid, quantity numeric, purchase_price numeric, vat_rate numeric, status text, unita_misura text,posizioni jsonb);
    create table purchase_orders(id uuid primary key default gen_random_uuid(), company_id uuid, supplier_id uuid, order_id uuid, created_by uuid, status text, oda_number text, notes text);
    create table purchase_order_items(id uuid primary key default gen_random_uuid(), company_id uuid, purchase_order_id uuid references purchase_orders(id), order_item_id uuid references order_items(id), description text check(description <> 'ERRORE_INSERIMENTO'), quantity numeric, unit_price numeric, vat_rate numeric, discount_percent numeric, unit_of_measure text, sort_order integer);
    grant select, insert, update on all tables in schema public to authenticated;
    alter table orders enable row level security; create policy tenant on orders to authenticated using(company_id='${company}');
    alter table suppliers enable row level security; create policy tenant on suppliers to authenticated using(company_id='${company}');
    alter table order_items enable row level security; create policy tenant on order_items to authenticated using(exists(select 1 from orders o where o.id=order_id));
    alter table purchase_orders enable row level security; create policy tenant on purchase_orders to authenticated using(company_id='${company}') with check(company_id='${company}');
    alter table purchase_order_items enable row level security; create policy tenant on purchase_order_items to authenticated using(company_id='${company}') with check(company_id='${company}');`);
  await db.exec(readFileSync("supabase/patches/bug54_oda_materiali_atomica.sql", "utf8"));
}, 60000);
beforeEach(async () => {
  await db.exec(`reset role; truncate purchase_order_items,purchase_orders,order_items,suppliers,orders;
    insert into orders values('${order}','${company}'),('${other}','${other}');
    insert into suppliers values('${supplier}','${company}'),('${other}','${other}');
    insert into order_items values('${item}','${order}','${supplier}',null,2,10,0,'da_ordinare','pz',null); set role authenticated;`);
});
afterAll(async () => { await db?.close(); });
const line = (description = "Materiale demo", quantity = 2) => ({ order_item_id: item, description, quantity, unit_price: 10, vat_rate: 0, discount_percent: 0, unit_of_measure: "pz" });
const create = (lines = [line()], tenant = company, job = order, vendor = supplier) => db.query("select crea_oda_materiali_atomica($1,$2,$3,$4::jsonb) as result", [tenant,job,vendor,JSON.stringify(lines)]);
it("crea testata e righe insieme, conserva IVA zero e lascia l'articolo da ordinare", async () => {
  await create();
  expect((await db.query("select status from purchase_orders")).rows).toEqual([{status:"bozza"}]);
  expect((await db.query("select quantity,vat_rate from purchase_order_items")).rows).toEqual([{quantity:"2",vat_rate:"0"}]);
  expect((await db.query("select status from order_items")).rows).toEqual([{status:"da_ordinare"}]);
});
it("un errore sulla seconda riga annulla anche testata e prima riga", async () => {
  await expect(create([line("Prima",1),line("ERRORE_INSERIMENTO",1)])).rejects.toThrow();
  expect((await db.query("select id from purchase_orders")).rows).toHaveLength(0);
  expect((await db.query("select id from purchase_order_items")).rows).toHaveLength(0);
});
it("un secondo tentativo non duplica quantità già coperte dalla prima bozza", async () => {
  await create(); await expect(create()).rejects.toThrow("Quantità o coperture cambiate");
  expect((await db.query("select id from purchase_orders")).rows).toHaveLength(1);
});
it("le RLS impediscono di usare una commessa e un fornitore di altra azienda", async () => {
  await expect(create([line()],other,other,other)).rejects.toThrow("non accessibili");
  expect((await db.query("select id from purchase_orders")).rows).toHaveLength(0);
});
it("un prezzo cambiato o un elenco vuoto non lasciano bozze", async () => {
  await expect(create([{...line(),unit_price:999}])).rejects.toThrow("Dati articolo");
  await expect(create([])).rejects.toThrow("Nessun articolo");
  expect((await db.query("select id from purchase_orders")).rows).toHaveLength(0);
});
