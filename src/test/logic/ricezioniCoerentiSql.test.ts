import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
let db: PGlite;
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12,"0")}`;
const patch = readFileSync("supabase/patches/check84_ricezioni_coerenti.sql","utf8");
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${id(1)}'::uuid$$;
    create function get_my_company_id() returns uuid language sql as $$select '${id(1)}'::uuid$$;
    create table orders(id uuid primary key,company_id uuid);
    create table order_items(id uuid primary key,order_id uuid,quantity_received integer default 0,receipt_id uuid,fulfillment_status text,last_goods_receipt_date timestamptz);
    create table warehouses(id uuid primary key,company_id uuid);
    create table purchase_orders(id uuid primary key,company_id uuid,status text,actual_delivery_date date);
    create table purchase_order_items(id uuid primary key default gen_random_uuid(),company_id uuid,purchase_order_id uuid,order_item_id uuid,quantity numeric,quantity_received numeric default 0,received_date date);
    create table ddt_ricezione(id uuid primary key,company_id uuid,purchase_order_id uuid);
    create table goods_receipts(id uuid primary key default gen_random_uuid(),order_item_id uuid,warehouse_id uuid,company_id uuid,supplier_id uuid,quantity_received integer,ddt_number text,ddt_photo_url text,quality_check_status text,quality_notes text,notes text,received_by uuid,ddt_ricezione_id uuid,receipt_date date default current_date);
    create table order_item_timeline(order_item_id uuid,company_id uuid,event_type text,event_by uuid,photo_url text,document_ref uuid,notes text,location text);`);
  for (const name of ["insert_goods_receipt_atomic","ricalcola_ricezione_oda"]) await db.exec(readFileSync(`src/test/fixtures/check84_prima_${name}.sql`,"utf8"));
  // Il calcolo reale viene richiamato dopo INSERT come nel trigger del portale.
  // Non simula i trigger di carico magazzino: integrazione completa ancora necessaria.
  await db.exec(`create function test_ricalcola() returns trigger language plpgsql as $$begin
    perform ricalcola_ricezione_oda((select purchase_order_id from ddt_ricezione where id=new.ddt_ricezione_id)); return new; end$$;
    create trigger test_ricalcola after insert on goods_receipts for each row execute function test_ricalcola();`);
  await db.exec(patch);
},60000);
beforeEach(async () => {
  await db.exec(`truncate orders,order_items,warehouses,purchase_orders,purchase_order_items,ddt_ricezione,goods_receipts,order_item_timeline;
    insert into orders values('${id(2)}','${id(1)}');
    insert into order_items(id,order_id) values('${id(3)}','${id(2)}');
    insert into warehouses values('${id(4)}','${id(1)}'),('${id(40)}','${id(99)}');
    insert into purchase_orders(id,company_id,status) values('${id(5)}','${id(1)}','confermato');
    insert into purchase_order_items(company_id,purchase_order_id,order_item_id,quantity) values('${id(1)}','${id(5)}','${id(3)}',2);
    insert into ddt_ricezione values('${id(6)}','${id(1)}','${id(5)}'),('${id(7)}','${id(1)}','${id(5)}'),('${id(60)}','${id(99)}','${id(5)}');`);
});
afterAll(async () => { await db?.close(); });
const ricevi = (qty = 1, ddt: string | null = id(6), warehouse = id(4)) => db.query("select insert_goods_receipt_atomic($1,$2,$3,'ok',null,null,null,$4)",[id(3),warehouse,qty,ddt]);
const count = async () => Number((await db.query<{n:number}>("select count(*) n from goods_receipts")).rows[0].n);
it("riceve su bolle distinte e allinea il residuo senza un secondo carico applicativo", async () => {
  await ricevi(); await ricevi(1,id(7));
  expect(await count()).toBe(2);
  expect((await db.query("select quantity_received::text as q from purchase_order_items")).rows).toEqual([{q:"2"}]);
  expect((await db.query("select status from purchase_orders")).rows).toEqual([{status:"ricevuto"}]);
  await expect(ricevi()).rejects.toThrow("stato ricevuto"); expect(await count()).toBe(2);
});
it.each(["bozza","annullato","ricevuto"])("non registra merce su ordine %s", async status => {
  await db.query("update purchase_orders set status=$1",[status]);
  await expect(ricevi()).rejects.toThrow("Ricezione non consentita"); expect(await count()).toBe(0);
});
it.each([0,-1,0.5,NaN,Infinity])("non registra quantità non supportata %s",async qty=>{
  await expect(ricevi(qty)).rejects.toThrow(); expect(await count()).toBe(0);
});
it("blocca una quantità superiore al residuo",async()=>{
  await ricevi(); await expect(ricevi(2,id(7))).rejects.toThrow("residuo"); expect(await count()).toBe(1);
});
it("non compensa automaticamente un contatore OdA diverso dalle ricezioni",async()=>{
  await ricevi(); await db.exec("update purchase_order_items set quantity_received=0");
  await expect(ricevi()).rejects.toThrow("non allineati"); expect(await count()).toBe(1);
});
it("non attribuisce a un OdA le ricezioni prive di DDT",async()=>{
  await ricevi(1,null); await expect(ricevi()).rejects.toThrow("senza DDT da riconciliare"); expect(await count()).toBe(1);
});
it("rifiuta magazzino e DDT di altra azienda",async()=>{
  await expect(ricevi(1,id(6),id(40))).rejects.toThrow("Magazzino");
  await expect(ricevi(1,id(60))).rejects.toThrow("DDT"); expect(await count()).toBe(0);
});
it("rifiuta un articolo non abbinato univocamente all'OdA",async()=>{
  await db.exec("insert into purchase_order_items(company_id,purchase_order_id,order_item_id,quantity) select company_id,purchase_order_id,order_item_id,quantity from purchase_order_items");
  await expect(ricevi()).rejects.toThrow("univocamente"); expect(await count()).toBe(0);
});
it("applicare due volte la patch non duplica la protezione",async()=>{
  await db.exec(patch); await ricevi(); expect(await count()).toBe(1);
});
