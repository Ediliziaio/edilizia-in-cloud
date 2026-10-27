import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nuovaAnalisiIntervento } from "@/lib/serramenti/analisiIntervento";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role authenticated; create table public.sr_progetti(id text primary key, company_id text not null, stato text default 'bozza', firmato_il timestamptz);
    alter table public.sr_progetti enable row level security;
    create policy azienda on public.sr_progetti to authenticated using(company_id=current_setting('app.company_id')) with check(company_id=current_setting('app.company_id'));
    grant select,insert,update on public.sr_progetti to authenticated;
    insert into public.sr_progetti(id,company_id) values('vecchio','a'),('estraneo','b');`);
  await db.exec(await readFile("supabase/migrations/20281026140002_analisi_serramenti_prima_dopo.sql", "utf8"));
}, 60000);
afterAll(async () => { await db.close(); });
describe("Migrazione della valutazione: solo database locale", () => {
  it("lascia intatti i progetti esistenti e salva il JSON completo", async () => {
    expect((await db.query<{ analisi_intervento: unknown }>("select analisi_intervento from sr_progetti where id='vecchio'")).rows[0].analisi_intervento).toBeNull();
    const a = nuovaAnalisiIntervento(); a.esistente = "legno"; a.posa.ripristini = "esclusa";
    await db.query("update sr_progetti set analisi_intervento=$1 where id='vecchio'", [JSON.stringify(a)]);
    expect((await db.query<{ analisi_intervento: unknown }>("select analisi_intervento from sr_progetti where id='vecchio'")).rows[0].analisi_intervento).toEqual(a);
  });
  it("rifiuta JSON non strutturati o di versione sconosciuta", async () => {
    for (const v of [[], {}, { ...nuovaAnalisiIntervento(), versione: 99 }])
      await expect(db.query("update sr_progetti set analisi_intervento=$1 where id='vecchio'", [JSON.stringify(v)])).rejects.toThrow();
  });
  it("mantiene la separazione tra le aziende", async () => {
    await db.exec("set role authenticated; set app.company_id='a'");
    const r = await db.query<{ id: string }>("select id from sr_progetti");
    expect(r.rows.map(r => r.id)).toEqual(["vecchio"]);
    expect((await db.query("update sr_progetti set analisi_intervento=$1 where id='estraneo' returning id", [JSON.stringify(nuovaAnalisiIntervento())])).rows).toEqual([]);
    await db.exec("reset role");
  });
  it("richiede una revisione per cambiare l'analisi di un preventivo firmato", async () => {
    await db.exec("update sr_progetti set stato='accettato' where id='vecchio'");
    await expect(db.query("update sr_progetti set analisi_intervento=$1 where id='vecchio'", [JSON.stringify(nuovaAnalisiIntervento())])).rejects.toThrow("revisione");
  });
});
