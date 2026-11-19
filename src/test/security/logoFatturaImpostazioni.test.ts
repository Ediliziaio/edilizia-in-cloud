import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
const nome = "20290420105000_logo_pdf_documenti_fiscali.sql";
const migrazione = readFileSync(existsSync(`supabase/migrations/${nome}`) ? `supabase/migrations/${nome}` : `docs/migrazioni-pronte/${nome}`, "utf8");
let db: PGlite;
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`create role authenticated;
    create table anagrafica_azienda(id integer primary key,company_id integer,logo_url text);
    insert into anagrafica_azienda values(1,10,'logo-demo'),(2,20,'altra-azienda');
    alter table anagrafica_azienda enable row level security;
    grant select,insert,update on anagrafica_azienda to authenticated;
    create policy azienda on anagrafica_azienda to authenticated using(company_id=current_setting('app.azienda')::integer) with check(company_id=current_setting('app.azienda')::integer);`);
  await db.exec(migrazione);
}, 30000);
afterAll(async () => { await db?.close(); });
it("la migrazione è idempotente e conserva logo e dati esistenti", async () => {
  await db.exec(migrazione);
  expect((await db.query("select logo_url,pdf_logo from anagrafica_azienda where id=1")).rows).toEqual([{ logo_url: "logo-demo", pdf_logo: {} }]);
});
it("le impostazioni persistono con i privilegi esistenti e l'altra azienda resta protetta", async () => {
  await db.exec("begin; set local role authenticated; set local app.azienda='10';");
  try {
    await db.exec(`update anagrafica_azienda set pdf_logo='{"posizione":"destra","dimensione":150,"spazioSopra":8}' where id=1;`);
    expect((await db.query("select pdf_logo from anagrafica_azienda")).rows).toEqual([{ pdf_logo: { posizione: "destra", dimensione: 150, spazioSopra: 8 } }]);
    expect((await db.query("update anagrafica_azienda set pdf_logo='{}' where id=2 returning id")).rows).toEqual([]);
  } finally { await db.exec("rollback;"); }
});
it("rifiuta un valore che non è un oggetto", async () => {
  await expect(db.exec("update anagrafica_azienda set pdf_logo='[]' where id=1")).rejects.toMatchObject({ code: "23514" });
});
