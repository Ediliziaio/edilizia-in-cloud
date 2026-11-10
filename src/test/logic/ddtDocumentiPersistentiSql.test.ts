import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
const id = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [company, user, order, supplier, warehouse, job] = [1, 2, 3, 4, 5, 6].map(
  id,
);
let db: PGlite;
const hash = "a".repeat(64);
const files = [
  {
    path: `${company}/${user}/${job}/1-originale.pdf`,
    name: "DDT.pdf",
    mime: "application/pdf",
    size: 100,
  },
];
const enqueue = (f = files, h = hash, o: string | null = order) =>
  db.query(
    "select ddt_documento_accoda($1,$2,$3,$4::jsonb,$5,'campo') as job",
    [job, company, o, JSON.stringify(f), h],
  );
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
    "create trigger ddt_muove_oda after insert on ddt_ricezione for each row execute function trg_ddt_muove_oda()",
  );
}, 60000);
beforeEach(async () => {
  await db.exec(`reset role;truncate ddt_document_jobs,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,orders,suppliers,warehouses,profiles,companies cascade;
  truncate storage.objects;
  select set_config('test.user','${user}',false),set_config('test.company','${company}',false),set_config('test.order','${order}',false),set_config('test.office','false',false),set_config('test.blocked','false',false);
  insert into companies values('${company}');insert into profiles values('${user}');insert into orders values('${order}','${company}',null);
  insert into suppliers(id,company_id) values('${supplier}','${company}');insert into warehouses values('${warehouse}','${company}');
  insert into storage.objects(bucket_id,name) values('ddt-documenti','${files[0].path}');`);
});
afterAll(async () => {
  await db?.close();
});
it("accoda solo dopo l'originale e riusa l'identità dopo un retry", async () => {
  expect((await enqueue()).rows[0]).toMatchObject({
    job: { id: job, duplicate: false, status: "queued" },
  });
  expect((await enqueue()).rows[0]).toMatchObject({
    job: { id: job, duplicate: true },
  });
  expect((await db.query("select * from ddt_ricezione")).rows).toHaveLength(0);
});
it("blocca cantieri estranei, cartelle altrui e file mai caricati", async () => {
  await expect(enqueue(files, hash, null)).rejects.toThrow("tuoi cantieri");
  await expect(
    enqueue([{ ...files[0], path: `${company}/${id(99)}/${job}/x.pdf` }]),
  ).rejects.toThrow("Percorso");
  await db.exec("delete from storage.objects");
  await expect(enqueue()).rejects.toThrow("caricamento non è completo");
});
it("non espone a un secondo operaio il documento duplicato di un collega", async () => {
  await enqueue();
  const altro = id(22),
    nuovo = id(23);
  const f = [{ ...files[0], path: `${company}/${altro}/${nuovo}/x.pdf` }];
  await db.exec(
    `insert into profiles values('${altro}');select set_config('test.user','${altro}',false);insert into storage.objects(bucket_id,name) values('ddt-documenti','${f[0].path}');`,
  );
  const r = await db.query(
    "select ddt_documento_accoda($1,$2,$3,$4::jsonb,$5,'campo') as job",
    [nuovo, company, order, JSON.stringify(f), hash],
  );
  expect(r.rows[0]).toEqual({
    job: { id: null, duplicate: true, status: "already_present" },
  });
});
it("riprende una lease scaduta senza duplicare il lavoro vivo e chiude il quinto arresto", async () => {
  await enqueue();
  const a = (await db.query("select * from ddt_documento_prendi()")).rows[0];
  expect(a).toMatchObject({ attempts: 1, status: "processing" });
  expect(
    (await db.query("select * from ddt_documento_prendi()")).rows,
  ).toHaveLength(0);
  await db.exec(
    "update ddt_document_jobs set lease_until=now()-interval '1 minute'",
  );
  const b = (await db.query("select * from ddt_documento_prendi()")).rows[0];
  expect(b).toMatchObject({ attempts: 2 });
  expect(b.lease_id).not.toBe(a.lease_id);
  await db.exec(
    "update ddt_document_jobs set attempts=5,lease_until=now()-interval '1 minute'",
  );
  await db.query("select * from ddt_documento_prendi()");
  expect(
    (await db.query("select status from ddt_document_jobs")).rows[0],
  ).toEqual({ status: "error" });
});
const dati = () => ({
  numero_ddt: "SIM-01",
  data_ricezione: "2026-11-10",
  order_id: order,
  supplier_id: supplier,
  destinazione: "cantiere",
  warehouse_id: warehouse,
  righe: [
    {
      descrizione: "Materiale senza prezzo",
      quantita: 2.5,
      unita_misura: "mq",
      prezzo_unitario: null,
    },
  ],
});
const registra = (d = dati()) =>
  db.query("select ddt_documento_registra($1,$2::jsonb) as id", [
    job,
    JSON.stringify(d),
  ]);
it("l'ufficio registra atomicamente righe senza prezzo e senza magazzino, una volta sola", async () => {
  await enqueue();
  await db.exec(
    "update ddt_document_jobs set status='review',result='{}';select set_config('test.office','true',false)",
  );
  const a = await registra(),
    b = await registra();
  expect(a.rows).toEqual(b.rows);
  expect(
    (await db.query("select destinazione,warehouse_id from ddt_ricezione"))
      .rows,
  ).toEqual([{ destinazione: "cantiere", warehouse_id: null }]);
  expect(
    (await db.query("select quantita,prezzo_unitario from ddt_righe")).rows,
  ).toEqual([{ quantita: "2.5", prezzo_unitario: null }]);
  expect(
    (await db.query("select * from warehouse_movements")).rows,
  ).toHaveLength(0);
});
it("un operaio non approva la propria lettura e un OdA in bozza non riceve merce", async () => {
  await enqueue();
  await db.exec("update ddt_document_jobs set status='review',result='{}'");
  await expect(registra()).rejects.toThrow("Non puoi registrare");
  await db.exec(
    `select set_config('test.office','true',false);insert into purchase_orders(id,company_id,supplier_id,order_id,status) values('${id(30)}','${company}','${supplier}','${order}','bozza')`,
  );
  await expect(
    registra({ ...dati(), purchase_order_id: id(30) } as ReturnType<
      typeof dati
    >),
  ).rejects.toThrow("OdA deve essere emesso");
  expect((await db.query("select * from ddt_ricezione")).rows).toHaveLength(0);
});

it("acquisire un documento su OdA confermato non lo porta a parziale prima delle consegne", async () => {
  await enqueue();
  await db.exec(
    `update ddt_document_jobs set status='review',result='{}';select set_config('test.office','true',false);insert into purchase_orders(id,company_id,supplier_id,order_id,status) values('${id(30)}','${company}','${supplier}','${order}','confermato')`,
  );
  await registra({ ...dati(), purchase_order_id: id(30) } as ReturnType<
    typeof dati
  >);
  expect(
    (await db.query("select status from purchase_orders")).rows[0],
  ).toEqual({ status: "confermato" });
});

it("RLS: un collega non legge l’originale altrui e un account sospeso non legge nemmeno il proprio", async () => {
  await enqueue();
  await db.exec("set role authenticated");
  expect(
    (await db.query("select id from ddt_document_jobs")).rows,
  ).toHaveLength(1);
  await db.exec(`select set_config('test.user','${id(77)}',false)`);
  expect(
    (await db.query("select id from ddt_document_jobs")).rows,
  ).toHaveLength(0);
  await db.exec(
    `select set_config('test.user','${user}',false),set_config('test.blocked','true',false)`,
  );
  expect(
    (await db.query("select id from ddt_document_jobs")).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
});
