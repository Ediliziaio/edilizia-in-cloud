import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const societa = "00000000-0000-0000-0000-000000000001";
const altra = "00000000-0000-0000-0000-000000000002";
const generale = "00000000-0000-0000-0000-000000000010";
const versione = "00000000-0000-0000-0000-000000000020";
beforeAll(async () => {
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${societa}'::uuid $$;
    create function public.puo_modificare_commessa(uuid) returns boolean language sql as $$ select true $$;
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$ select $3 = '${societa}'::uuid $$;
    create table generale_piano_versioni(id uuid primary key, generale_id uuid, company_id uuid, stato text, nota text, updated_at timestamptz, approvata_at timestamptz, approvata_da uuid);
    create table generale_piano_voci(id uuid primary key default gen_random_uuid(), versione_id uuid, descrizione text, importo numeric, mese date, nota text);
    create table purchase_order_items(id uuid primary key, company_id uuid);
    create table fatture_ricevute(id uuid primary key, company_id uuid, righe jsonb);
    insert into generale_piano_versioni values ('${versione}','${generale}','${societa}','bozza',null,now(),null,null);
    insert into generale_piano_voci(versione_id,descrizione,importo,mese,nota) values ('${versione}','Costruzione',100,null,'[EIC:DA_STIMARE]');
    insert into purchase_order_items values ('${societa}','${societa}'), ('${altra}','${altra}');
  `);
  const sql = readFileSync("supabase/migrations/20281031110000_generale_piano_economico.sql", "utf8");
  const start = sql.indexOf("create or replace function public.generale_piano_approva(");
  await db.exec(sql.slice(start, sql.indexOf("$$;", start) + 3));
  await db.exec(readFileSync("supabase/proposals/20261111061847_generale_budget_completezza.sql", "utf8"));
});
afterAll(() => db.close());
it("il vero RPC di approvazione resta atomico e rifiuta stime e calendari mancanti", async () => {
  const approva = () => db.query("select generale_piano_approva($1, null)", [versione]);
  await expect(approva()).rejects.toThrow("Budget incompleto");
  await db.exec("update generale_piano_voci set nota = null");
  await expect(approva()).rejects.toThrow("Budget incompleto");
  expect((await db.query<{ stato: string }>("select stato from generale_piano_versioni")).rows[0].stato).toBe(
    "bozza",
  );
  await db.exec("update generale_piano_voci set mese = '2026-12-01'");
  await approva();
  expect((await db.query<{ stato: string }>("select stato from generale_piano_versioni")).rows[0].stato).toBe(
    "approvata",
  );
});
it("il vincolo blocca la stessa riga sorgente nella stessa versione, consentendo una revisione", async () => {
  const nota = `[EIC-BP:${"a".repeat(64)}:Realistico:12]`;
  const insert = (v: string) =>
    db.query(
      "insert into generale_piano_voci(versione_id,descrizione,importo,nota) values ($1,'Terreno',0,$2)",
      [v, nota],
    );
  await insert(versione);
  await expect(insert(versione)).rejects.toThrow("generale_piano_fonte_unica");
  await expect(insert(generale)).resolves.toBeDefined();
});
it("un'approvazione fallita non supera la versione precedente e non autorizza altre società", async () => {
  const bozza = "00000000-0000-0000-0000-000000000030";
  await db.query(
    "insert into generale_piano_versioni(id,generale_id,company_id,stato) values ($1,$2,$3,'bozza')",
    [bozza, generale, societa],
  );
  await db.query(
    "insert into generale_piano_voci(versione_id,descrizione,importo,nota) values ($1,'Impianti',0,'[EIC:DA_STIMARE]')",
    [bozza],
  );
  await expect(db.query("select generale_piano_approva($1,null)", [bozza])).rejects.toThrow(
    "Budget incompleto",
  );
  expect(
    (await db.query<{ stato: string }>("select stato from generale_piano_versioni where id=$1", [versione]))
      .rows[0].stato,
  ).toBe("approvata");
  await db.query("update generale_piano_versioni set company_id=$1 where id=$2", [altra, bozza]);
  await expect(db.query("select generale_piano_approva($1,null)", [bozza])).rejects.toThrow("permesso");
});
it("una fattura non può collegare righe di ordine di un'altra società", async () => {
  await expect(
    db.query("insert into fatture_ricevute values ($1,$2,$3)", [
      versione,
      societa,
      JSON.stringify([{ purchase_order_item_id: altra }]),
    ]),
  ).rejects.toThrow("società");
  await expect(
    db.query("insert into fatture_ricevute values ($1,$2,$3)", [
      versione,
      societa,
      JSON.stringify([{ purchase_order_item_id: societa }]),
    ]),
  ).resolves.toBeDefined();
});
it("la proposta per il consuntivo esclude oneri futuri o previsti anche dopo la loro scadenza", async () => {
  const sql = readFileSync("supabase/proposals/20261111070518_generale_oneri_effettivi.sql", "utf8");
  const predicate = sql
    .match(/and fm\.data <= current_date\s+and coalesce\(fm\.nota, ''\) not like '[^']+'/)?.[0]
    .replace(/^and /, "");
  expect(predicate).toBeTruthy();
  const result = await db.query<{ importo: number }>(
    `select fm.importo from (values ('2000-01-01'::date, ''::text, 100), ('2099-01-01'::date, '', 200), ('2000-01-01'::date, '[EIC:MOVIMENTO_PREVISTO]', 300)) fm(data,nota,importo) where ${predicate}`,
  );
  expect(result.rows).toEqual([{ importo: 100 }]);
  expect(sql).toContain("from public, anon, authenticated");
});
