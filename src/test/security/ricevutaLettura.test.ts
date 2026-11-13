import { afterAll, beforeAll, beforeEach, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  invoice = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
beforeAll(async () => {
  await pg.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'')='true'$$;
 create table fatture_ricevute(id uuid primary key,company_id uuid,stato text,company_cost_id uuid,pagata_il date,note_interne text);
 alter table fatture_ricevute enable row level security;
 create policy tenant on fatture_ricevute for all to authenticated using(company_id=current_setting('test.company')::uuid) with check(company_id=current_setting('test.company')::uuid);
 grant usage on schema public,auth to authenticated;grant select,update on fatture_ricevute to authenticated;`);
  await pg.exec(
    await readFile(
      "supabase/migrations/20290317103000_fatture_ricevute_stato_lettura.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/20290317103000_fatture_ricevute_stato_lettura.sql",
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await pg.exec(
    `reset role;truncate fatture_ricevute;insert into fatture_ricevute values('${invoice}','${company}','non_letta',null,null,'Nota già presente',null);select set_config('test.user','${invoice}',false);select set_config('test.company','${company}',false);select set_config('test.blocked','false',false);set role authenticated;`,
  );
});
afterAll(() => pg.close());
async function mark(unread: boolean, co = company) {
  return (
    await pg.query<{ r: { stato: string; da_leggere: boolean } }>(
      "select fattura_ricevuta_lettura($1,$2,$3) r",
      [co, invoice, unread],
    )
  ).rows[0].r;
}
it("aprire segna letta; la scelta manuale può rimettere non letta e poi una nuova apertura la rilegge", async () => {
  expect(await mark(false)).toMatchObject({
    stato: "letta",
    da_leggere: false,
  });
  expect(await mark(true)).toMatchObject({
    stato: "non_letta",
    da_leggere: true,
  });
  expect(await mark(false)).toMatchObject({
    stato: "letta",
    da_leggere: false,
  });
});
it("contabilizzazione, rifiuto, pagamento e note non cambiano marcando la lettura", async () => {
  for (const state of ["contabilizzata", "rifiutata"]) {
    await pg.exec(
      `reset role;update fatture_ricevute set stato='${state}',company_cost_id='${other}',pagata_il='2026-11-12';set role authenticated;`,
    );
    expect((await mark(true)).stato).toBe(state);
    expect((await mark(false)).stato).toBe(state);
    const row = (
      await pg.query<{
        company_cost_id: string;
        pagata_il: string;
        note_interne: string;
      }>("select company_cost_id,pagata_il,note_interne from fatture_ricevute")
    ).rows[0];
    expect(row.company_cost_id).toBe(other);
    expect(row.note_interne).toBe("Nota già presente");
  }
});
it("non sovrascrive una contabilizzazione effettuata dopo la lettura della lista", async () => {
  await pg.exec(
    "reset role;update fatture_ricevute set stato='contabilizzata';set role authenticated;",
  );
  expect((await mark(false)).stato).toBe("contabilizzata");
});
it("rispetta azienda, RLS e blocco utente", async () => {
  await expect(mark(false, other)).rejects.toThrow(/non disponibile/);
  await pg.exec("select set_config('test.blocked','true',false)");
  await expect(mark(false)).rejects.toThrow(/non autorizzata/);
});
