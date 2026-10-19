// Motore SQL reale in Postgres WASM isolato. Nessun dato/live SDI o rete.
// Auth/RLS e anagrafica sono fixture; non è uno stress test concorrente di produzione.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const company = "11111111-1111-4111-a111-111111111111";
const user = "22222222-2222-4222-a222-222222222222";
const leggi = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
const base = leggi("20280927220000_numerazione_documenti_formato_configurabile.sql");
const funzione = (name: string) => {
  const start = base.indexOf(`create or replace function public.${name}(`);
  const end = name === "formatta_numero_documento" ? "$$;" : "$function$;";
  return base.slice(start, base.indexOf(end, start) + end.length);
};
const migration = leggi("20261019082105_emissione_bozza_data_corrente.sql");

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function user_can_access_company(uuid) returns boolean language sql as
      $$select $1::text=current_setting('test.company',true)$$;
    create function puo_gestire_documento_fiscale(uuid,text) returns boolean language sql as
      $$select coalesce(current_setting('test.billing',true),'')<>'no'$$;
    create table anagrafica_azienda(company_id uuid primary key,formato_numero text,nc_serie_condivisa boolean default false,
      prefisso_fattura text default 'FPR',ultimo_numero_fattura int default 73,anno_corrente_fattura int,
      prefisso_nc text default 'NC',ultimo_numero_nc int default 0,
      prefisso_ddt text,ultimo_numero_ddt int,prefisso_preventivo text,ultimo_numero_preventivo int,anno_corrente_preventivo int,
      prefisso_proforma text,ultimo_numero_proforma int,anno_corrente_proforma int);
    create table documenti_fiscali(id uuid primary key default gen_random_uuid(),company_id uuid,
      tipo text default 'fattura',numero text default 'Bozza TEST',numero_progressivo int default 0,anno int,
      data_emissione date,stato text default 'bozza',deleted_at timestamptz,updated_at timestamptz,
      righe jsonb default '[{"descrizione":"Lavori","quantita":1,"prezzo_unitario":62000}]',
      cliente_snapshot jsonb default '{"ragione_sociale":"BIEMME TEST"}',
      totale_documento numeric default 75640,data_scadenza date,scadenze_pagamento jsonb default '[]');
    alter table documenti_fiscali enable row level security;
    create policy fixture_read on documenti_fiscali for select to authenticated
      using(company_id::text=current_setting('test.company',true));
    create policy fixture_write on documenti_fiscali for update to authenticated
      using(company_id::text=current_setting('test.company',true))
      with check(company_id::text=current_setting('test.company',true));
    grant usage on schema public,auth to authenticated;
    grant select,update on documenti_fiscali to authenticated;
  `);
  for (const name of ["formatta_numero_documento", "genera_numero_documento_native", "documento_emetti"]) {
    await db.exec(funzione(name));
  }
  // La migrazione effettiva, non una copia della logica in TypeScript.
  await db.exec(migration);
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`reset role; truncate documenti_fiscali,anagrafica_azienda;
    set test.uid='${user}'; set test.company='${company}'; set test.billing='yes';
    insert into anagrafica_azienda(company_id,anno_corrente_fattura,formato_numero)
      values('${company}',extract(year from now() at time zone 'Europe/Rome'),'{prefisso} {n}/{yy}');
    insert into documenti_fiscali(company_id,numero,numero_progressivo,anno,data_emissione,stato)
      values('${company}','FPR 73/26',73,extract(year from now() at time zone 'Europe/Rome'),current_date-17,'inviata_sdi'),
        ('${company}','FPR 5/26',5,extract(year from now() at time zone 'Europe/Rome'),current_date-3,'inviata_sdi');
  `);
});

async function draft(offset = -7) {
  return (await db.query<{id: string}>(`insert into documenti_fiscali(company_id,anno,data_emissione,data_scadenza)
    values($1,extract(year from now() at time zone 'Europe/Rome'),current_date+$2::int,current_date+30) returning id`, [company,offset])).rows[0].id;
}
const emit = (id: string) => db.query<{r: {numero: string; numero_progressivo: number; anno: number}}>("select documento_emetti_oggi($1) as r", [id]);
const get = async (id: string) => (await db.query<Record<string, unknown>>("select * from documenti_fiscali where id=$1", [id])).rows[0];
const counter = async () => (await db.query<{n: number}>("select ultimo_numero_fattura n from anagrafica_azienda where company_id=$1", [company])).rows[0].n;
const today = async () => (await db.query<{d: string}>("select (now() at time zone 'Europe/Rome')::date::text d")).rows[0].d;

describe("Bozza → data di oggi e progressivo all'emissione", () => {
  it("riproduce il blocco BIEMME, poi emette la 74 senza alterare la FPR 5", async () => {
    const id = await draft();
    await expect(db.query("select documento_emetti($1)", [id])).rejects.toThrow("numero successivo");
    expect(await counter()).toBe(73);
    const previous = (await db.query("select * from documenti_fiscali where numero_progressivo=5")).rows;
    const before = await get(id);
    await db.exec("set role authenticated");
    const result = (await emit(id)).rows[0].r;
    expect(result.numero_progressivo).toBe(74);
    expect(result.numero).toMatch(/^FPR 74\/\d{2}$/);
    const after = await get(id);
    expect((await db.query<{d: string}>("select data_emissione::text d from documenti_fiscali where id=$1",[id])).rows[0].d).toBe(await today());
    for (const key of ["righe","cliente_snapshot","totale_documento","data_scadenza","scadenze_pagamento"]) {
      expect(after[key], key).toEqual(before[key]);
    }
    expect(after.stato).toBe("emessa"); // non pretende una trasmissione SDI
    await db.exec("reset role");
    expect(await counter()).toBe(74);
    expect((await db.query("select * from documenti_fiscali where numero_progressivo=5")).rows).toEqual(previous);
  });

  it("due bozze prendono il numero nell'ordine di emissione, non di creazione", async () => {
    const first = await draft(-20), second = await draft(-1);
    expect(await counter()).toBe(73);
    expect((await emit(second)).rows[0].r.numero_progressivo).toBe(74);
    expect((await emit(first)).rows[0].r.numero_progressivo).toBe(75);
  });

  it("una bozza dell'anno scorso usa l'anno italiano di emissione", async () => {
    const id = await draft(-400);
    await db.query("update documenti_fiscali set anno=extract(year from current_date)-1 where id=$1",[id]);
    const result = (await emit(id)).rows[0].r;
    expect(result.anno).toBe(Number((await today()).slice(0,4)));
    expect(result.numero_progressivo).toBe(74);
  });

  it("il cambio anno del contatore avviene solo quando si emette", async () => {
    const id = await draft();
    await db.exec("update anagrafica_azienda set anno_corrente_fattura=extract(year from current_date)-1; update documenti_fiscali set anno=anno-1 where stato<>'bozza'");
    expect((await emit(id)).rows[0].r.numero_progressivo).toBe(1);
  });

  it.each(["righe='[]'", "cliente_snapshot='{}'"])("se fallisce %s torna indietro anche la data", async patch => {
    const id = await draft(); await db.query(`update documenti_fiscali set ${patch} where id=$1`,[id]);
    const before = await get(id);
    await expect(emit(id)).rejects.toThrow();
    expect(await get(id)).toEqual(before); expect(await counter()).toBe(73);
  });

  it("un errore dopo l'incremento annulla numero, data e contatore", async () => {
    const id = await draft(); const before = await get(id);
    await db.exec(`update documenti_fiscali set data_emissione=current_date+2 where numero_progressivo=73`);
    await expect(emit(id)).rejects.toThrow("numero successivo");
    expect(await get(id)).toEqual(before); expect(await counter()).toBe(73);
  });

  it("doppio clic o reinvio non ridata una fattura emessa e non consuma il 75", async () => {
    const id = await draft(); await emit(id); const issued = await get(id);
    await expect(emit(id)).rejects.toThrow("Solo i documenti in bozza");
    expect(await get(id)).toEqual(issued); expect(await counter()).toBe(74);
  });

  it.each(["proforma","preventivo","ddt"])("non ridata %s", async tipo => {
    const id = await draft(-2);
    await db.query("update documenti_fiscali set tipo=$2,numero='DOC-1',numero_progressivo=1 where id=$1",[id,tipo]);
    const before = await get(id); await emit(id);
    expect((await get(id)).data_emissione).toEqual(before.data_emissione); expect(await counter()).toBe(73);
  });

  it("non ridata un recupero già numerato né disabilita la cronologia", async () => {
    const id = await draft(-7);
    await db.query("update documenti_fiscali set numero='FPR 74/26',numero_progressivo=74 where id=$1",[id]);
    const before = await get(id); await expect(emit(id)).rejects.toThrow("numero successivo");
    expect(await get(id)).toEqual(before); expect(await counter()).toBe(73);
  });

  it("la nota di credito segue la serie condivisa dell'azienda", async () => {
    const id = await draft();
    await db.query("update documenti_fiscali set tipo='nota_credito' where id=$1",[id]);
    await db.exec("update anagrafica_azienda set nc_serie_condivisa=true");
    expect((await emit(id)).rows[0].r.numero_progressivo).toBe(74);
  });

  it("non consente l'emissione senza autenticazione o permesso", async () => {
    const id = await draft(); const before = await get(id);
    await db.exec("set test.uid=''"); await expect(emit(id)).rejects.toThrow("autenticato");
    await db.exec(`set test.uid='${user}'; set test.billing='no'`);
    await expect(emit(id)).rejects.toThrow("permesso");
    expect(await get(id)).toEqual(before); expect(await counter()).toBe(73);
  });

  it("RLS: un'altra azienda non può nemmeno caricare la bozza", async () => {
    const id = await draft(); const before = await get(id);
    await db.exec("set role authenticated; set test.company='33333333-3333-4333-a333-333333333333'");
    await expect(emit(id)).rejects.toThrow("Documento non trovato");
    await db.exec("reset role"); expect(await get(id)).toEqual(before); expect(await counter()).toBe(73);
  });

  it("un documento nel cestino non si emette", async () => {
    const id = await draft(); await db.query("update documenti_fiscali set deleted_at=now() where id=$1",[id]);
    await expect(emit(id)).rejects.toThrow("Documento non trovato"); expect(await counter()).toBe(73);
  });

  it("il nuovo ingresso non espone privilegi elevati e non è invocabile da anon", async () => {
    const row = (await db.query<{prosecdef: boolean; allowed: boolean}>(`select prosecdef,
      has_function_privilege('anon',oid,'execute') allowed from pg_proc where oid='documento_emetti_oggi(uuid)'::regprocedure`)).rows[0];
    expect(row).toEqual({prosecdef:false,allowed:false});
  });
});
