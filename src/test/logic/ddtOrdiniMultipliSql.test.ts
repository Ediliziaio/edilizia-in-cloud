import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
const id = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [
  azienda,
  utente,
  commessa,
  fornitore,
  magazzino,
  ddt,
  riga,
  oda,
  clima,
  tapp,
] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(
    readFileSync("src/test/fixtures/ddt_documenti_base.sql", "utf8"),
  );
  await db.exec(
    "alter table purchase_orders add column oda_number text;alter table purchase_order_items add column description text,add column sku text,add column sort_order integer;",
  );
  await db.exec(`create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
    create function aziende_con_permesso(p text) returns uuid[] language sql stable as $$select case when campo_e_ufficio(nullif(current_setting('test.company',true),'')::uuid) then array[nullif(current_setting('test.company',true),'')::uuid] else '{}'::uuid[] end$$;`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20290214110000_ddt_consegne_materiali.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290312122500_ddt_lettura_acquisti.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20290312123000_ddt_confronto_ordini_arrivi.sql",
      "utf8",
    ),
  );
}, 60000);
beforeEach(async () => {
  await db.exec(`truncate ddt_ordini_acquisto,ddt_consegne,ddt_operazioni_consegna,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,warehouse_movements,warehouse_stock,orders,suppliers,warehouses,profiles,companies cascade;
    select set_config('test.user','${utente}',false),set_config('test.company','${azienda}',false),set_config('test.order','${commessa}',false),set_config('test.office','true',false),set_config('test.blocked','false',false),set_config('test.readonly','false',false);
    insert into companies values('${azienda}');insert into profiles values('${utente}');insert into orders values('${commessa}','${azienda}',null);insert into suppliers(id,company_id) values('${fornitore}','${azienda}');insert into warehouses values('${magazzino}','${azienda}');
    insert into purchase_orders(id,company_id,supplier_id,order_id,status) values('${oda}','${azienda}','${fornitore}','${commessa}','confermato');
    insert into purchase_order_items(id,purchase_order_id,company_id,quantity,unit_of_measure) values('${clima}','${oda}','${azienda}',10,'pz'),('${tapp}','${oda}','${azienda}',2,'pz');
    insert into ddt_ricezione(id,company_id,order_id,supplier_id,purchase_order_id,numero_ddt,data_ricezione,destinazione) values('${ddt}','${azienda}','${commessa}','${fornitore}','${oda}','SIMULAZIONE-1','2026-11-11','cantiere');
    insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura,purchase_order_item_id,abbinamento) values('${riga}','${ddt}','${azienda}','Condizionatori',10,'pz','${clima}','manuale');`);
});
afterAll(async () => {
  await db?.close();
});

it("la proposta AI salva solo l’abbinamento e rifiuta una revisione diventata obsoleta", async () => {
  const c = (
    await db.query<{ c: { impronta: string; ordini: unknown[] } }>(
      "select ddt_confronto_ai_contesto($1) as c",
      [ddt],
    )
  ).rows[0].c;
  expect(c.ordini).toHaveLength(2);
  await db.query("select ddt_accetta_abbinamento_ai($1,$2,$3,$4)", [
    ddt,
    riga,
    tapp,
    c.impronta,
  ]);
  expect((await db.query("select * from ddt_consegne")).rows).toHaveLength(0);
  await expect(
    db.query("select ddt_accetta_abbinamento_ai($1,$2,$3,$4)", [
      ddt,
      riga,
      clima,
      c.impronta,
    ]),
  ).rejects.toThrow("confronto è cambiato");
});

it("il ruolo Acquisti legge i DDT aziendali senza assegnazione a un magazzino", async () => {
  await db.exec(
    "alter table ddt_ricezione enable row level security;grant usage on schema public,auth to authenticated;grant select on ddt_ricezione to authenticated;set role authenticated",
  );
  try {
    expect((await db.query("select id from ddt_ricezione")).rows).toEqual([
      { id: ddt },
    ]);
  } finally {
    await db.exec(
      "reset role;alter table ddt_ricezione disable row level security;",
    );
  }
});
const ricevi = (q: number, op = 20, doc = ddt, item = riga, patch = {}) =>
  db.query("select ddt_conferma_consegna($1,$2,$3::jsonb) as esito", [
    id(op),
    doc,
    JSON.stringify([
      {
        riga_id: item,
        quantita: q,
        destinazione: "cantiere",
        order_id: commessa,
        crea_articolo: true,
        ...patch,
      },
    ]),
  ]);
it("10 condizionatori, poi 2 tapparelle: parziale → ricevuto, due DDT, nessun magazzino", async () => {
  await ricevi(10);
  expect((await db.query("select status from purchase_orders")).rows).toEqual([
    { status: "parziale" },
  ]);
  const d2 = id(21),
    r2 = id(22);
  await db.exec(
    `insert into ddt_ricezione(id,company_id,order_id,supplier_id,purchase_order_id,numero_ddt,data_ricezione,destinazione) values('${d2}','${azienda}','${commessa}','${fornitore}','${oda}','SIMULAZIONE-2','2026-11-12','cantiere');insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura,purchase_order_item_id) values('${r2}','${d2}','${azienda}','Tapparelle',2,'pz','${tapp}');`,
  );
  await ricevi(2, 23, d2, r2);
  expect((await db.query("select status from purchase_orders")).rows).toEqual([
    { status: "ricevuto" },
  ]);
  expect(
    (await db.query("select * from ddt_ordini_collegati")).rows,
  ).toHaveLength(2);
  expect(
    (await db.query("select * from warehouse_movements")).rows,
  ).toHaveLength(0);
  expect((await db.query("select * from warehouse_stock")).rows).toHaveLength(
    0,
  );
});
it("una riga del DDT si ripartisce su due ordini e i retry non la duplicano", async () => {
  const o2 = id(30),
    i2 = id(31);
  await db.exec(
    `update purchase_order_items set quantity=6 where id='${clima}';insert into purchase_orders(id,company_id,supplier_id,order_id,status) values('${o2}','${azienda}','${fornitore}','${commessa}','inviato');insert into purchase_order_items(id,purchase_order_id,company_id,quantity,unit_of_measure) values('${i2}','${o2}','${azienda}',4,'pz');`,
  );
  await ricevi(6);
  await ricevi(4, 21, ddt, riga, { purchase_order_item_id: i2 });
  expect(
    (await ricevi(4, 21, ddt, riga, { purchase_order_item_id: i2 })).rows[0],
  ).toMatchObject({ esito: { gia_registrata: true } });
  expect(
    (
      await db.query(
        "select quantity_received from purchase_order_items where id in ($1,$2) order by quantity_received",
        [clima, i2],
      )
    ).rows,
  ).toEqual([{ quantity_received: "4" }, { quantity_received: "6" }]);
  expect(
    (await db.query("select * from ddt_ordini_collegati")).rows,
  ).toHaveLength(2);
  await expect(ricevi(1, 22)).rejects.toThrow("supera");
});
it("un collegamento senza quantità conserva l’ordine e non registra merce", async () => {
  await db.exec(
    `insert into ddt_ordini_acquisto(ddt_id,purchase_order_id,company_id) values('${ddt}','${oda}','${azienda}');`,
  );
  expect(
    (await db.query("select * from ddt_ordini_collegati")).rows,
  ).toHaveLength(1);
  expect((await db.query("select * from ddt_consegne")).rows).toHaveLength(0);
});
it("blocca eccedenze non accettate e unità diverse, senza scritture parziali", async () => {
  await db.exec(
    `update purchase_order_items set quantity=8 where id='${clima}';`,
  );
  await expect(ricevi(10)).rejects.toThrow("eccedenza");
  expect((await db.query("select * from ddt_consegne")).rows).toHaveLength(0);
  await db.exec(
    `update purchase_order_items set unit_of_measure='kg' where id='${clima}';`,
  );
  await expect(ricevi(2)).rejects.toThrow("unità");
});
it("il reso riapre l’ordine e non può superare la consegna originale", async () => {
  await ricevi(10);
  const origine = (
    await db.query<{ id: string }>("select id from ddt_consegne")
  ).rows[0].id;
  const d2 = id(21),
    r2 = id(22);
  await db.exec(
    `insert into ddt_ricezione(id,company_id,order_id,supplier_id,numero_ddt,data_ricezione,destinazione) values('${d2}','${azienda}','${commessa}','${fornitore}','RESO','2026-11-12','cantiere');insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura) values('${r2}','${d2}','${azienda}','Reso condizionatori',11,'pz');`,
  );
  await ricevi(1, 23, d2, r2, { tipo: "reso", consegna_origine_id: origine });
  expect(
    (
      await db.query(
        "select quantity_received from purchase_order_items where id=$1",
        [clima],
      )
    ).rows,
  ).toEqual([{ quantity_received: "9" }]);
  await expect(
    ricevi(10, 24, d2, r2, { tipo: "reso", consegna_origine_id: origine }),
  ).rejects.toThrow("reso supera");
});
it("l’utente in sola lettura e quello bloccato non possono confermare", async () => {
  await db.exec("select set_config('test.readonly','true',false)");
  await expect(ricevi(1)).rejects.toThrow("Non puoi");
  await db.exec(
    "select set_config('test.readonly','false',false),set_config('test.blocked','true',false)",
  );
  await expect(ricevi(1)).rejects.toThrow("Non puoi");
});
it("non collega ordini di un altro fornitore o in bozza", async () => {
  await db.exec(
    `update purchase_orders set supplier_id='${id(40)}' where id='${oda}'`,
  );
  await expect(
    db.exec(
      `insert into ddt_ordini_acquisto values('${ddt}','${oda}','${azienda}',null,now())`,
    ),
  ).rejects.toThrow("stesso fornitore");
  await db.exec(
    `update purchase_orders set supplier_id='${fornitore}',status='bozza' where id='${oda}'`,
  );
  await expect(
    db.exec(
      `insert into ddt_ordini_acquisto values('${ddt}','${oda}','${azienda}',null,now())`,
    ),
  ).rejects.toThrow("Emetti");
});
