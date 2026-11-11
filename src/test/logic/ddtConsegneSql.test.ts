import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
const id = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [
  company,
  user,
  order,
  supplier,
  warehouse,
  ddt,
  riga,
  oda,
  poi,
  articolo,
] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(
    readFileSync("src/test/fixtures/ddt_documenti_base.sql", "utf8"),
  );
  await db.exec(`create function stock_test_trigger() returns trigger language plpgsql as $$begin return new; end$$;
  create trigger stock_test_trigger before update on warehouse_stock for each row when (old.quantity is distinct from new.quantity) execute function stock_test_trigger();`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214110000_ddt_consegne_materiali.sql",
      "utf8",
    ),
  );
}, 60000);
beforeEach(async () => {
  await db.exec(`truncate ddt_consegne,ddt_operazioni_consegna,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,warehouse_movements,warehouse_stock,orders,suppliers,warehouses,profiles,companies cascade;
  select set_config('test.user','${user}',false),set_config('test.company','${company}',false),set_config('test.order','${order}',false),set_config('test.office','true',false),set_config('test.blocked','false',false);
  insert into companies values('${company}');insert into profiles values('${user}');insert into orders values('${order}','${company}',null);
  insert into suppliers(id,company_id) values('${supplier}','${company}');insert into warehouses values('${warehouse}','${company}');
  insert into ddt_ricezione(id,company_id,order_id,supplier_id,numero_ddt,data_ricezione,destinazione) values('${ddt}','${company}','${order}','${supplier}','SIM','2026-11-10','cantiere');
  insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura) values('${riga}','${ddt}','${company}','Articolo nuovo',5.5,'mq');`);
});
afterAll(async () => {
  await db?.close();
});
const ingresso = (patch: Record<string, unknown> = {}) => ({
  riga_id: riga,
  quantita: 2.5,
  destinazione: "cantiere",
  order_id: order,
  crea_articolo: true,
  ...patch,
});
const conferma = (righe = [ingresso()], op = id(20), documento = ddt) =>
  db.query("select ddt_conferma_consegna($1,$2,$3::jsonb) as risultato", [
    op,
    documento,
    JSON.stringify(righe),
  ]);
it("senza OdA crea un solo materiale della commessa senza prezzo, senza giacenze, e resiste ai retry", async () => {
  await conferma();
  expect((await conferma()).rows[0]).toMatchObject({
    risultato: { gia_registrata: true },
  });
  expect(
    (
      await db.query(
        "select quantity_received,purchase_price,prezzo_da_definire,stock_item_id from order_items",
      )
    ).rows,
  ).toEqual([
    {
      quantity_received: "2.5",
      purchase_price: null,
      prezzo_da_definire: true,
      stock_item_id: null,
    },
  ]);
  expect(
    (await db.query("select * from warehouse_movements")).rows,
  ).toHaveLength(0);
});
it("ripartisce la stessa riga fra cantiere e magazzino con quantità decimali, senza duplicare", async () => {
  await conferma([
    ingresso(),
    ingresso({
      quantita: 3,
      destinazione: "magazzino",
      warehouse_id: warehouse,
    }),
  ]);
  expect(
    (
      await db.query(
        "select quantity,unita_misura,prezzo_da_definire from warehouse_stock",
      )
    ).rows,
  ).toEqual([{ quantity: "3", unita_misura: "mq", prezzo_da_definire: true }]);
  expect(
    (await db.query("select quantity_received from order_items")).rows,
  ).toEqual([{ quantity_received: "2.5" }]);
  expect(
    (await db.query("select quantity from warehouse_movements")).rows,
  ).toEqual([{ quantity: "3" }]);
});
it("una riga errata annulla tutto il lotto e blocca le quantità sopra la bolla", async () => {
  await expect(
    conferma([ingresso(), ingresso({ quantita: 4 })]),
  ).rejects.toThrow("supera");
  expect((await db.query("select * from order_items")).rows).toHaveLength(0);
  expect(
    (await db.query("select * from ddt_operazioni_consegna")).rows,
  ).toHaveLength(0);
});
const preparaOda = async (status = "confermato") => {
  await db.exec(`insert into order_items(id,order_id,name,quantity,unita_misura) values('${articolo}','${order}','Materiale',4,'m2');
  insert into purchase_orders(id,company_id,supplier_id,order_id,status) values('${oda}','${company}','${supplier}','${order}','${status}');
  insert into purchase_order_items(id,purchase_order_id,company_id,order_item_id,quantity,unit_of_measure) values('${poi}','${oda}','${company}','${articolo}',4,'mq');
  update ddt_ricezione set purchase_order_id='${oda}';update ddt_righe set purchase_order_item_id='${poi}',abbinamento='manuale';`);
};
it("con OdA emesso riceve soltanto la quantità scelta, preserva il residuo e non carica il magazzino", async () => {
  await preparaOda();
  await conferma();
  expect(
    (await db.query("select quantity_received from purchase_order_items")).rows,
  ).toEqual([{ quantity_received: "2.5" }]);
  expect((await db.query("select status from purchase_orders")).rows).toEqual([
    { status: "parziale" },
  ]);
  expect(
    (await db.query("select count(*)::int as n from order_items")).rows,
  ).toEqual([{ n: 1 }]);
  expect((await db.query("select * from warehouse_stock")).rows).toHaveLength(
    0,
  );
});
it("blocca l'OdA in bozza e richiede consenso esplicito per le eccedenze", async () => {
  await preparaOda("bozza");
  await expect(conferma()).rejects.toThrow("emesso");
  await db.exec("update purchase_orders set status='inviato'");
  await expect(conferma([ingresso({ quantita: 5 })])).rejects.toThrow(
    "eccedenza",
  );
  await conferma([ingresso({ quantita: 5, accetta_eccedenza: true })]);
  expect(
    (await db.query("select quantity_received from purchase_order_items")).rows,
  ).toEqual([{ quantity_received: "5" }]);
});
it("il reso riferito alla consegna originale riduce i materiali, senza inventare acquisti", async () => {
  await conferma();
  const c = (await db.query<{ id: string }>("select id from ddt_consegne"))
    .rows[0].id;
  const d2 = id(30),
    r2 = id(31);
  await db.exec(
    `insert into ddt_ricezione(id,company_id,order_id,supplier_id,numero_ddt,data_ricezione,destinazione) values('${d2}','${company}','${order}','${supplier}','RESO','2026-11-10','cantiere');insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura) values('${r2}','${d2}','${company}','Reso articolo',1,'mq');`,
  );
  await conferma(
    [
      ingresso({
        riga_id: r2,
        quantita: 1,
        tipo: "reso",
        consegna_origine_id: c,
      }),
    ],
    id(40),
    d2,
  );
  expect(
    (await db.query("select quantity_received from order_items")).rows,
  ).toEqual([{ quantity_received: "1.5" }]);
});
it("servizi e noleggi si confermano senza crearne materiali o scorte", async () => {
  await conferma([ingresso({ tipo: "servizio" })]);
  expect((await db.query("select * from order_items")).rows).toHaveLength(0);
  expect((await db.query("select tipo from ddt_consegne")).rows).toEqual([
    { tipo: "servizio" },
  ]);
});
it("blocca modifiche a merce già consegnata e accessi di altre aziende", async () => {
  await conferma();
  await expect(db.exec("update ddt_righe set quantita=8")).rejects.toThrow(
    "Consegna già confermata",
  );
  await db.exec(`select set_config('test.company','${id(99)}',false)`);
  await expect(conferma([ingresso({ quantita: 1 })], id(22))).rejects.toThrow(
    "Non puoi confermare",
  );
});
