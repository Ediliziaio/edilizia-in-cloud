import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
const id = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [c, u, o, s, d, r, f] = [1, 2, 3, 4, 5, 6, 7].map(id);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(
    readFileSync("src/test/fixtures/ddt_documenti_base.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214100000_ddt_documenti_persistenti.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214110000_ddt_consegne_materiali.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214120000_ddt_prezzi_da_fattura.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214130000_ddt_acquisizione_rifiniture.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214140000_ddt_compatibilita_righe.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214150000_ddt_valorizzazione_tenant.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214160000_ddt_prezzi_magazzino.sql",
      "utf8",
    ),
  );
}, 60000);
beforeEach(async () => {
  await db.exec(`truncate ddt_valorizzazioni,fattura_ddt,fatture_ricevute,ddt_consegne,ddt_operazioni_consegna,ddt_document_jobs,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,warehouse_movements,warehouse_stock,warehouses,orders,suppliers,profiles,companies cascade;
select set_config('test.user','${u}',false),set_config('test.company','${c}',false),set_config('test.office','true',false),set_config('test.blocked','false',false);
insert into companies values('${c}');insert into profiles values('${u}');insert into orders values('${o}','${c}',null);insert into suppliers values('${s}','${c}','08236870963');
insert into ddt_ricezione(id,company_id,order_id,supplier_id,numero_ddt,data_ricezione,destinazione) values('${d}','${c}','${o}','${s}','SIM','2026-11-10','cantiere');
insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura) values('${r}','${d}','${c}','Nuovo',5,'mq');
insert into order_items(order_id,name,quantity,quantity_received,purchase_price,prezzo_da_definire,ddt_riga_origine_id) values('${o}','Nuovo',5,5,null,true,'${r}');
insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura,cedente_piva) values('${f}','${c}','${s}','SIM-FATTURA','IT08236870963');`);
});
afterAll(async () => {
  await db?.close();
});
const prezzo = (q = 5, p = 12, fattura = f) =>
  db.query("select ddt_valorizza_da_fattura($1,$2,$3::jsonb)", [
    d,
    fattura,
    JSON.stringify([{ riga_id: r, quantita: q, prezzo_unitario: p }]),
  ]);
it("la fattura completa il prezzo senza aggiungere ricezioni, materiali o movimenti", async () => {
  await prezzo();
  await prezzo();
  expect(
    (
      await db.query(
        "select quantity_received,purchase_price::float8 as purchase_price,prezzo_da_definire from order_items",
      )
    ).rows,
  ).toEqual([
    { quantity_received: "5", purchase_price: 12, prezzo_da_definire: false },
  ]);
  expect(
    (await db.query("select count(*)::int as n from ddt_valorizzazioni")).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (await db.query("select count(*)::int as n from fattura_ddt")).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (await db.query("select * from warehouse_movements")).rows,
  ).toHaveLength(0);
});
it("due fatture parziali conservano il prezzo mancante finché la quantità non è coperta", async () => {
  await prezzo(2, 10);
  expect(
    (
      await db.query(
        "select purchase_price,prezzo_da_definire from order_items",
      )
    ).rows[0],
  ).toEqual({ purchase_price: null, prezzo_da_definire: true });
  const f2 = id(8);
  await db.exec(
    `insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura) values('${f2}','${c}','${s}','SIM-2')`,
  );
  await prezzo(3, 20, f2);
  expect(
    (
      await db.query(
        "select purchase_price::float8 as purchase_price from order_items",
      )
    ).rows[0],
  ).toEqual({ purchase_price: 16 });
});
it("rifiuta fatture di un altro fornitore, quantità in eccesso e modifiche silenziose", async () => {
  await db.exec(
    "update fatture_ricevute set fornitore_id=null,cedente_piva='99999999999'",
  );
  await expect(prezzo()).rejects.toThrow("stesso fornitore");
  await db.exec(`update fatture_ricevute set fornitore_id='${s}'`);
  await expect(prezzo(6)).rejects.toThrow("superano");
  await prezzo();
  await expect(prezzo(5, 99)).rejects.toThrow("dati diversi");
});

it("la provenienza di una voce non può puntare a una bolla di un’altra azienda", async () => {
  const altra = id(50),
    commessa = id(51);
  await db.exec(
    `insert into companies values('${altra}');insert into orders values('${commessa}','${altra}',null)`,
  );
  await expect(
    db.exec(
      `insert into order_items(order_id,name,ddt_riga_origine_id) values('${commessa}','Estraneo','${r}')`,
    ),
  ).rejects.toThrow("non appartiene");
});

it("valorizza il magazzino dalla fattura senza un secondo carico, anche dopo uno scarico parziale", async () => {
  const wh = id(80);
  await db.exec(`insert into warehouses values('${wh}','${c}')`);
  await db.query("select ddt_conferma_consegna($1,$2,$3::jsonb)", [
    id(81),
    d,
    JSON.stringify([
      {
        riga_id: r,
        quantita: 5,
        destinazione: "magazzino",
        warehouse_id: wh,
        crea_articolo: true,
      },
    ]),
  ]);
  const stock = (
    await db.query<{ id: string }>("select id from warehouse_stock")
  ).rows[0].id;
  await db.exec(
    `insert into warehouse_movements(company_id,stock_item_id,quantity,movement_type,unit_cost,created_at) values('${c}','${stock}',2,'scarico',0,now()+interval '1 second');update warehouse_stock set quantity=3 where id='${stock}'`,
  );
  await prezzo();
  await prezzo();
  expect(
    (
      await db.query(
        "select quantity,unit_cost::float8 as prezzo,prezzo_da_definire from warehouse_stock",
      )
    ).rows,
  ).toEqual([{ quantity: "3", prezzo: 12, prezzo_da_definire: false }]);
  expect(
    (
      await db.query(
        "select quantity,unit_cost::float8 as prezzo from warehouse_movements where movement_type='carico'",
      )
    ).rows,
  ).toEqual([{ quantity: "5", prezzo: 12 }]);
  expect(
    (await db.query("select count(*)::int as n from warehouse_movements")).rows,
  ).toEqual([{ n: 2 }]);
});

it("un prezzo esplicito di zero è valido e uno storico incompleto non riscrive il costo medio", async () => {
  const wh = id(80);
  await db.exec(`insert into warehouses values('${wh}','${c}')`);
  await db.query("select ddt_conferma_consegna($1,$2,$3::jsonb)", [
    id(81),
    d,
    JSON.stringify([
      {
        riga_id: r,
        quantita: 5,
        destinazione: "magazzino",
        warehouse_id: wh,
        crea_articolo: true,
      },
    ]),
  ]);
  await prezzo(5, 0);
  expect(
    (
      await db.query(
        "select unit_cost::float8 as prezzo,prezzo_da_definire from warehouse_stock",
      )
    ).rows,
  ).toEqual([{ prezzo: 0, prezzo_da_definire: false }]);
  await db.exec(
    "update warehouse_stock set quantity=99,unit_cost=77,prezzo_da_definire=true;update ddt_righe set prezzo_unitario=15",
  );
  expect(
    (
      await db.query(
        "select quantity,unit_cost::float8 as prezzo,prezzo_da_definire from warehouse_stock",
      )
    ).rows,
  ).toEqual([{ quantity: "99", prezzo: 77, prezzo_da_definire: true }]);
});

it("mescola il nuovo lotto valorizzato con la giacenza storica senza riscriverne il prezzo", async () => {
  const wh = id(80),
    stock = id(82);
  await db.exec(
    `insert into warehouses values('${wh}','${c}');insert into warehouse_stock(id,company_id,warehouse_id,name,quantity,unit_cost,unita_misura) values('${stock}','${c}','${wh}','Storico',3,20,'mq');insert into warehouse_movements(company_id,stock_item_id,quantity,movement_type,unit_cost,created_at) values('${c}','${stock}',3,'carico',20,now()-interval '1 day')`,
  );
  await db.query("select ddt_conferma_consegna($1,$2,$3::jsonb)", [
    id(81),
    d,
    JSON.stringify([
      {
        riga_id: r,
        quantita: 5,
        destinazione: "magazzino",
        warehouse_id: wh,
        stock_item_id: stock,
      },
    ]),
  ]);
  expect(
    (await db.query("select prezzo_da_definire from warehouse_stock")).rows,
  ).toEqual([{ prezzo_da_definire: true }]);
  await prezzo();
  expect(
    (
      await db.query(
        "select quantity,unit_cost::float8 as prezzo,prezzo_da_definire from warehouse_stock",
      )
    ).rows,
  ).toEqual([{ quantity: "8", prezzo: 15, prezzo_da_definire: false }]);
  expect(
    (
      await db.query(
        "select unit_cost::float8 as prezzo from warehouse_movements order by created_at",
      )
    ).rows,
  ).toEqual([{ prezzo: 20 }, { prezzo: 12 }]);
});
