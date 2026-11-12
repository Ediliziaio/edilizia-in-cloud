/**
 * Bolle dal telefono (12/11/2026, migrazione 20290313210000):
 *  - «solo la foto»: la bolla dell'operaio resta `da_leggere`, il cron non la prende,
 *    l'ufficio la manda in lettura o la compila a mano;
 *  - l'operaio manda «in magazzino» senza commessa; «in cantiere» la commessa resta obbligatoria;
 *  - la registrazione senza magazzini non si blocca (warehouse_id nullo, carico in sospeso),
 *    con un magazzino solo usa quello, e chi l'ha registrata la rilegge.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [company, user, order, supplier, warehouse, job] = [1, 2, 3, 4, 5, 6].map(id);
const hash = "b".repeat(64);
const files = [
  { path: `${company}/${user}/${job}/1-originale.jpg`, name: "bolla.jpg", mime: "image/jpeg", size: 100 },
];
let db: PGlite;
const leggi = (f: string) => readFileSync(f, "utf8");

const accoda = (dest: string | null, o: string | null = order, w: string | null = null) =>
  db.query<{ job: { id: string; status: string; duplicate: boolean } }>(
    "select ddt_documento_accoda($1,$2,$3,$4::jsonb,$5,'campo',$6::text,$7::uuid) as job",
    [job, company, o, JSON.stringify(files), hash, dest, w],
  );
const accodaVecchia = (o: string | null) =>
  db.query("select ddt_documento_accoda($1,$2,$3,$4::jsonb,$5,'campo') as job", [
    job, company, o, JSON.stringify(files), hash,
  ]);
const registra = (d: Record<string, unknown>) =>
  db.query<{ id: string }>("select ddt_documento_registra($1,$2::jsonb) as id", [job, JSON.stringify(d)]);
const datiBase = { numero_ddt: "B-1", data_ricezione: "2026-11-12", supplier_id: supplier, righe: [] as unknown[] };
const stato = async () =>
  (await db.query<{ status: string; destinazione: string | null; order_id: string | null }>(
    "select status,destinazione,order_id from ddt_document_jobs where id=$1", [job],
  )).rows[0];
const soloFoto = () =>
  db.exec(`insert into company_acquisti_impostazioni(company_id,bolle_telefono_lettura) values('${company}','solo_foto')
           on conflict(company_id) do update set bolle_telefono_lettura='solo_foto'`);
// La stessa condizione del cron ddt-documenti-recovery.
const cronSveglia = async () =>
  (await db.query<{ c: boolean }>(
    "select exists(select 1 from ddt_document_jobs where (attempts<5 and retry_at<=now() and status='queued') or (status='processing' and lease_until<now())) as c",
  )).rows[0].c;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(leggi("src/test/fixtures/ddt_documenti_base.sql"));
  for (const m of [
    "20290214100000_ddt_documenti_persistenti",
    "20290214110000_ddt_consegne_materiali",
    "20290214120000_ddt_prezzi_da_fattura",
    "20290214130000_ddt_acquisizione_rifiniture",
  ])
    await db.exec(leggi(`supabase/migrations/${m}.sql`));
  await db.exec(`
    alter table warehouses add column is_active boolean default true, add column is_default boolean default false,
      add column position integer default 0, add column created_at timestamptz default now();
    create table company_acquisti_impostazioni(company_id uuid primary key references companies, updated_at timestamptz, updated_by uuid);
    create function get_my_company_id() returns uuid language sql stable as $$select nullif(current_setting('test.company',true),'')::uuid$$;
    create function get_my_warehouse_ids() returns uuid[] language sql stable as $$select array[]::uuid[]$$;
    create function aziende_con_permesso(p text) returns uuid[] language sql stable as
      $$select case when current_setting('test.perm_magazzino',true)='true' then array[get_my_company_id()] else array[]::uuid[] end$$;
    grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;
    grant select on ddt_ricezione to authenticated;
    alter table ddt_ricezione enable row level security;
    -- Come in produzione: chi non è amministratore legge solo le bolle dei suoi magazzini.
    create policy ddt_ricezione_scoped_access on ddt_ricezione for all to authenticated using (
      company_id = get_my_company_id() and (current_setting('test.admin',true)='true' or warehouse_id = any(get_my_warehouse_ids())));
  `);
  await db.exec(leggi("supabase/migrations/20290313210000_bolle_telefono_solo_foto_e_magazzino.sql"));
}, 60000);

beforeEach(async () => {
  await db.exec(`reset role;truncate ddt_document_jobs,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,orders,suppliers,warehouses,company_acquisti_impostazioni,profiles,companies cascade;
  truncate storage.objects;
  select set_config('test.user','${user}',false),set_config('test.company','${company}',false),set_config('test.order','${order}',false),set_config('test.office','false',false),set_config('test.blocked','false',false),set_config('test.external','false',false),set_config('test.multicompany','false',false),set_config('test.admin','false',false),set_config('test.perm_magazzino','false',false);
  insert into companies values('${company}');insert into profiles values('${user}');insert into orders values('${order}','${company}',null);
  insert into suppliers(id,company_id) values('${supplier}','${company}');
  insert into storage.objects(bucket_id,name) values('ddt-documenti','${files[0].path}');`);
});
afterAll(async () => {
  await db?.close();
});

it("predefinito: la bolla dell'operaio va subito in lettura, come prima", async () => {
  expect((await accoda("cantiere")).rows[0].job).toMatchObject({ status: "queued", duplicate: false });
  expect(await cronSveglia()).toBe(true);
});

it("solo la foto: resta da leggere, il cron non la prende; la lettura la avvia l'ufficio", async () => {
  await soloFoto();
  expect((await accoda("cantiere")).rows[0].job).toMatchObject({ status: "da_leggere" });
  expect(await cronSveglia()).toBe(false);
  expect((await db.query("select * from ddt_documento_prendi()")).rows).toHaveLength(0);
  expect((await db.query("select * from ddt_documento_prendi($1)", [job])).rows).toHaveLength(0);
  // L'operaio non la manda in lettura da sé.
  await expect(db.query("select ddt_documento_ritenta($1)", [job])).rejects.toThrow("la avvia l'ufficio");
  await db.exec("select set_config('test.office','true',false)");
  await db.query("select ddt_documento_ritenta($1)", [job]);
  expect((await stato()).status).toBe("queued");
  expect((await db.query("select * from ddt_documento_prendi()")).rows).toHaveLength(1);
});

it("solo la foto non vale per l'ufficio, che dal telefono ha il suo interruttore", async () => {
  await soloFoto();
  await db.exec("select set_config('test.office','true',false)");
  expect((await accoda("magazzino", null)).rows[0].job).toMatchObject({ status: "queued" });
});

it("l'operaio manda in magazzino senza commessa", async () => {
  expect((await accoda("magazzino", null)).rows[0].job).toMatchObject({ status: "queued" });
  expect(await stato()).toMatchObject({ destinazione: "magazzino", order_id: null });
});

it("l'operaio in cantiere senza commessa è rifiutato, e il client vecchio senza commessa pure", async () => {
  await expect(accoda("cantiere", null)).rejects.toThrow("tuoi cantieri");
  await expect(accodaVecchia(null)).rejects.toThrow("tuoi cantieri");
  // Commessa non sua: rifiutata anche se va in magazzino.
  await db.exec(`insert into orders values('${id(40)}','${company}',null)`);
  await expect(accoda("magazzino", id(40))).rejects.toThrow("tuoi cantieri");
  // Utente bloccato o cliente esterno: niente, neppure in magazzino.
  await db.exec("select set_config('test.external','true',false)");
  await expect(accoda("magazzino", null)).rejects.toThrow("Non puoi acquisire");
});

it("registra senza magazzini: la bolla nasce con warehouse_id nullo, partendo da «da leggere»", async () => {
  await soloFoto();
  await accoda("magazzino", null);
  await db.exec("select set_config('test.office','true',false)");
  // Nessuna destinazione nei dati: vale quella scelta sul telefono.
  await registra({ ...datiBase, righe: [{ descrizione: "Sacchi di cemento", quantita: 10 }] });
  expect((await db.query("select destinazione,warehouse_id,order_id,ai_confidenza from ddt_ricezione")).rows).toEqual([
    { destinazione: "magazzino", warehouse_id: null, order_id: null, ai_confidenza: null },
  ]);
  expect((await stato()).status).toBe("registered");
});

it("registra con un solo magazzino: usa quello; con più magazzini il predefinito", async () => {
  await db.exec(`insert into warehouses(id,company_id) values('${warehouse}','${company}')`);
  await accoda("magazzino", null);
  await db.exec("update ddt_document_jobs set status='review',result='{}';select set_config('test.office','true',false)");
  await registra({ ...datiBase, destinazione: "magazzino" });
  expect((await db.query("select warehouse_id from ddt_ricezione")).rows).toEqual([{ warehouse_id: warehouse }]);

  await db.exec(`truncate ddt_document_jobs,ddt_righe,ddt_ricezione cascade;
    insert into warehouses(id,company_id,is_default) values('${id(51)}','${company}',true)`);
  await db.exec("select set_config('test.office','false',false)");
  await accoda("magazzino", null);
  await db.exec("update ddt_document_jobs set status='review',result='{}';select set_config('test.office','true',false)");
  await registra({ ...datiBase, numero_ddt: "B-2" });
  expect((await db.query("select warehouse_id from ddt_ricezione")).rows).toEqual([{ warehouse_id: id(51) }]);
});

it("chi non è amministratore rilegge subito la bolla magazzino senza magazzino che ha registrato", async () => {
  await accoda("magazzino", null);
  await db.exec("update ddt_document_jobs set status='review',result='{}';select set_config('test.office','true',false)");
  const bolla = (await registra(datiBase)).rows[0].id;
  await db.exec("set role authenticated");
  expect((await db.query("select id from ddt_ricezione")).rows).toEqual([{ id: bolla }]);
  // Un collega senza il permesso del magazzino no; con il permesso sì.
  await db.exec(`select set_config('test.user','${id(77)}',false)`);
  expect((await db.query("select id from ddt_ricezione")).rows).toHaveLength(0);
  await db.exec("select set_config('test.perm_magazzino','true',false)");
  expect((await db.query("select id from ddt_ricezione")).rows).toHaveLength(1);
  // Cliente esterno: no.
  await db.exec("select set_config('test.external','true',false)");
  expect((await db.query("select id from ddt_ricezione")).rows).toHaveLength(0);
  await db.exec("reset role");
});
