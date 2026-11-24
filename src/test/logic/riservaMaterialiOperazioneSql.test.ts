import { afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { databaseRiservaMaterialiOperazione } from "../fixtures/riservaMaterialiOperazione";

const id = (n: number) => `88000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [company, user, generale, ordine, fornitore, deposito, stock, articolo] = Array.from({ length: 8 }, (_, i) => id(i + 1));
let db: PGlite;
afterEach(async () => { await db?.close(); });

async function apri() {
  db = await databaseRiservaMaterialiOperazione({ company, user, generale, ordine, fornitore, deposito, stock, articolo, unita: "m²" });
  await db.exec("set role authenticated");
}

const riserva = (q: number, attesi = 0, richiesta = id(51), padre = generale, riga = articolo) =>
  db.query("select commessa_riserva_materiale($1,$2,$3,$4,$5,$6) as esito", [padre,riga,stock,q,attesi,richiesta]);
const compra = (quantity: number) => db.query("select crea_oda_materiali_atomica($1,$2,$3,$4::jsonb)", [company,ordine,fornitore,JSON.stringify([
  { order_item_id: articolo, description: "Gres demo", quantity, unit_price: 10, vat_rate: 22, unit_of_measure: "m²" },
])]);
const disponibilita = async () => (await db.query("select quantity,quantity_reserved,quantity_available from warehouse_stock")).rows[0];

it("mantiene 74 m² di fabbisogno, riserva 37 idempotenti e fa ordinare fino al residuo", async () => {
  await apri();
  const prima = await riserva(37);
  expect(prima.rows[0]).toEqual({ esito: { order_item_id: articolo, reserved: 37, da_ordinare: 37 } });
  expect((await riserva(37)).rows).toEqual(prima.rows);
  expect(await disponibilita()).toEqual({ quantity: "37", quantity_reserved: "37", quantity_available: "0" });
  await expect(compra(38)).rejects.toThrow(/coperture cambiate/);
  await compra(37);
  expect((await db.query("select quantity from purchase_order_items")).rows).toEqual([{ quantity: "37" }]);
  expect((await db.query("select quantity,warehouse_supply_quantity from order_items")).rows)
    .toEqual([{ quantity: "74", warehouse_supply_quantity: "37" }]);
  await expect(compra(1)).rejects.toThrow(/coperture cambiate/);
  await expect(riserva(36, 0, id(53))).rejects.toThrow(/riserva è cambiata/);
  await riserva(0, 37, id(54));
  expect(await disponibilita()).toEqual({ quantity: "37", quantity_reserved: "0", quantity_available: "37" });
  expect((await db.query("select stock_item_id,warehouse_supply_quantity from order_items")).rows).toEqual([{ stock_item_id: null, warehouse_supply_quantity: null }]);
  await expect(compra(38)).rejects.toThrow(/coperture cambiate/);
  await compra(37);
});

it("rifiuta stock sovraimpegnato, altro ambito, permessi mancanti e una richiesta dopo l'OdA", async () => {
  await apri();
  await expect(riserva(38)).rejects.toThrow(/Prenotazione non disponibile/);
  await expect(riserva(37, 0, id(52), id(91))).rejects.toThrow(/Riga non accessibile/);
  await db.query("select set_config('test.actor',$1,false)", [id(99)]);
  await expect(riserva(37)).rejects.toThrow(/non autorizzata/);
  await db.query("select set_config('test.actor',$1,false)", [user]);
  await compra(50);
  await expect(riserva(37)).rejects.toThrow(/fabbisogno libero/);
  await riserva(24);
  expect(await disponibilita()).toEqual({ quantity: "37", quantity_reserved: "24", quantity_available: "13" });
});

it("due unità non riescono a prenotare lo stesso saldo libero", async () => {
  await apri();
  const altraUnita = id(72), altraRiga = id(73);
  await db.query("insert into orders(id,company_id,workflow_kind,commessa_generale_id) values($1,$2,'commessa',$3)", [altraUnita,company,generale]);
  await db.query("insert into order_items(id,order_id,natura_riga,unita_misura,quantity) values($1,$2,'materiale','m²',74)", [altraRiga,altraUnita]);
  await riserva(37);
  await expect(riserva(1, 0, id(55), generale, altraRiga)).rejects.toThrow(/Prenotazione non disponibile/);
  expect(await disponibilita()).toEqual({ quantity: "37", quantity_reserved: "37", quantity_available: "0" });
});
