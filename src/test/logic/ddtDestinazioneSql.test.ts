import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
const company = "00000000-0000-4000-a000-000000000001";
const oda = "00000000-0000-4000-a000-000000000002";
const ddt = "00000000-0000-4000-a000-000000000003";
const item = "00000000-0000-4000-a000-000000000004";
const stock = "00000000-0000-4000-a000-000000000005";
const patch = readFileSync("supabase/patches/bug65_ddt_destinazione.sql", "utf8");
let db: PGlite;
beforeAll(async () => {
 db = new PGlite(); await db.waitReady;
 await db.exec(`create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
 create function get_my_company_id() returns uuid language sql as $$select '${company}'::uuid$$;
 create function utente_bloccato() returns boolean language sql as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
 create table purchase_orders(id uuid primary key, company_id uuid, supplier_id uuid, oda_number text, order_id uuid, ticket_id uuid, status text, actual_delivery_date date, updated_at timestamptz);
 create table purchase_order_items(id uuid primary key, purchase_order_id uuid, quantity numeric, quantity_received numeric, order_item_id uuid, stock_item_id uuid, received_date date);
 create table ddt_ricezione(id uuid primary key default gen_random_uuid(), company_id uuid, purchase_order_id uuid, numero_ddt text, data_ricezione date, stato text, note text, source text, warehouse_id uuid, ddt_file_url text, created_by uuid, quantita_ricevuta numeric, destinazione text default 'magazzino');
 create table warehouse_stock(id uuid primary key, company_id uuid, quantity numeric, supplier_id uuid, warehouse_id uuid, last_delivery_date date, updated_at timestamptz);
 create table warehouse_movements(stock_item_id uuid, movement_type text, quantity integer, notes text, performed_by uuid, company_id uuid, warehouse_id uuid, order_id uuid, order_item_id uuid);`);
 await db.exec(readFileSync("src/test/fixtures/oda_registra_arrivo_prima_bug65.sql", "utf8"));
 await db.exec(patch);
}, 60000);
beforeEach(async () => {
 await db.exec(`truncate purchase_orders, purchase_order_items, ddt_ricezione, warehouse_stock, warehouse_movements;
 insert into purchase_orders(id,company_id,oda_number,status) values('${oda}','${company}','TEST','confermato');
 insert into purchase_order_items(id,purchase_order_id,quantity,quantity_received) values('${item}','${oda}',2,0);
 insert into ddt_ricezione(id,company_id,purchase_order_id,numero_ddt,quantita_ricevuta,destinazione) values('${ddt}','${company}','${oda}','TEST-DDT',0,'cantiere');
 insert into warehouse_stock(id,company_id,quantity) values('${stock}','${company}',5);`);
});
afterAll(async () => { await db?.close(); });
const ricevi = () => db.query(`select * from oda_registra_arrivo($1,$2::jsonb,p_ddt_id=>$3)`, [oda, JSON.stringify([{item_id:item, quantity:2, stock_item_id:stock}]), ddt]);
it("RPC diretta: cantiere riceve le quantità ma non aumenta scorte né movimenti", async () => {
 expect((await ricevi()).rows[0]).toMatchObject({ righe_registrate:1, quantita_totale:"2", oda_completo:true, errori:[] });
 expect((await db.query("select quantity from warehouse_stock")).rows).toEqual([{quantity:"5"}]);
 expect((await db.query("select * from warehouse_movements")).rows).toHaveLength(0);
 expect((await db.query("select stock_item_id, quantity_received from purchase_order_items")).rows).toEqual([{stock_item_id:null,quantity_received:"2"}]);
});
it("magazzino continua a caricare una sola volta anche ripetendo la richiesta", async () => {
 await db.exec("update ddt_ricezione set destinazione='magazzino'");
 await ricevi(); await ricevi();
 expect((await db.query("select quantity from warehouse_stock")).rows).toEqual([{quantity:"7"}]);
 expect((await db.query("select quantity from warehouse_movements")).rows).toEqual([{quantity:2}]);
});
it("rifiuta bolle di un'altra azienda prima di modificare quantità e scorte", async () => {
 await db.exec("update ddt_ricezione set company_id='00000000-0000-4000-a000-000000000099'");
 await expect(ricevi()).rejects.toThrow("Bolla non valida");
 expect((await db.query("select quantity_received from purchase_order_items")).rows).toEqual([{quantity_received:"0"}]);
});
it("la patch si può riapplicare senza duplicare la guardia", async () => {
 await db.exec(patch); await ricevi();
 expect((await db.query("select quantity from warehouse_stock")).rows).toEqual([{quantity:"5"}]);
});
