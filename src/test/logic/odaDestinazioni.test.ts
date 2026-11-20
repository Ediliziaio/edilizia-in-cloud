import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const azienda = id(1), altra = id(2), a = id(3), b = id(4), estranea = id(5), ordine = id(6), riga = id(7), magazzino = id(8);
const migrazione = readFileSync("supabase/migrations/20290430143000_destinazioni_righe_ordine_acquisto.sql", "utf8");
let db: PGlite;
const destinazione = (id: string, quantita: number, tipo = "commessa") => ({ tipo, id, quantita });
const salva = (quote: ReturnType<typeof destinazione>[]) =>
  db.query("update purchase_order_items set destinazioni_previste=$1::jsonb where id=$2 returning destinazioni_previste", [JSON.stringify(quote), riga]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema private;
    create role anon;
    create role authenticated;
    create table public.orders(id uuid primary key, company_id uuid, order_code text, work_address text, deleted_at timestamptz);
    create table public.warehouses(id uuid primary key, company_id uuid, name text, is_active boolean);
    create table public.order_items(id uuid primary key, order_id uuid);
    create table public.purchase_orders(id uuid primary key, company_id uuid, order_id uuid);
    create table public.purchase_order_items(id uuid primary key, company_id uuid, purchase_order_id uuid, order_item_id uuid,
      quantity numeric(12,3), quantity_received numeric(12,3));
    insert into public.orders values
      ('${a}','${azienda}','A','Via A',null),('${b}','${azienda}','B','Via B',null),('${estranea}','${altra}','X','Via X',null);
    insert into public.warehouses values ('${magazzino}','${azienda}','Centrale',true);
    insert into public.purchase_orders values ('${ordine}','${azienda}',null);
  `);
  await db.exec(migrazione);
  await db.exec(migrazione);
}, 20000);
beforeEach(async () => {
  await db.exec("truncate public.purchase_order_items; update public.purchase_orders set order_id=null;");
  await db.query("insert into purchase_order_items(id,company_id,purchase_order_id,quantity,quantity_received) values ($1,$2,$3,100,0)",
    [riga, azienda, ordine]);
});
afterAll(async () => { await db?.close(); });

describe("Destinazioni pianificate di una riga OdA", () => {
  it("conserva le due quote da 60 e 40 con i riferimenti reali delle commesse", async () => {
    expect((await salva([destinazione(a, 60), destinazione(b, 40)])).rows).toEqual([{
      destinazioni_previste: [
        { ...destinazione(a, 60), nome: "A", indirizzo: "Via A" },
        { ...destinazione(b, 40), nome: "B", indirizzo: "Via B" },
      ],
    }]);
    await expect(db.query("update purchase_orders set order_id=$1 where id=$2", [a, ordine])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("update purchase_order_items set quantity=101 where id=$1", [riga])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("update purchase_order_items set quantity=120,destinazioni_previste=$1 where id=$2",
      [JSON.stringify([destinazione(a, 80), destinazione(b, 40)]), riga])).resolves.toBeDefined();
  });

  it("blocca ripartizioni incomplete, doppioni e destinazioni fuori azienda", async () => {
    await expect(salva([destinazione(a, 60), destinazione(b, 30)])).rejects.toMatchObject({ code: "23514" });
    await expect(salva([destinazione(a, 60), destinazione(a, 40)])).rejects.toMatchObject({ code: "23514" });
    await expect(salva([destinazione(a, 60), destinazione(estranea, 40)])).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select destinazioni_previste from purchase_order_items")).rows).toEqual([{ destinazioni_previste: [] }]);
  });

  it("una parte può andare a magazzino, la ricezione parziale mantiene la ripartizione", async () => {
    await salva([destinazione(a, 60), destinazione(magazzino, 40, "magazzino")]);
    await db.query("update purchase_order_items set quantity_received=40 where id=$1", [riga]);
    await expect(salva([])).rejects.toMatchObject({ code: "23514" });
    await expect(salva([destinazione(a, 100)])).rejects.toMatchObject({ code: "23514" });
    expect((await db.query("select quantity_received from purchase_order_items")).rows).toEqual([{ quantity_received: "40.000" }]);
  });
});
