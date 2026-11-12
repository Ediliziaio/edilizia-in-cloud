import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const pg = new PGlite();
// UUID reali nei collegamenti; gli ID sintetici dei documenti rimangono testo.
function fixtureSQL(sql: string) {
  const ids: Record<string,string> = { a:"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", b:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", o1:"11111111-1111-4111-a111-111111111111", o2:"22222222-2222-4222-a222-222222222222", "altro-ordine":"33333333-3333-4333-a333-333333333333" };
  return sql.replaceAll("company_id text", "company_id uuid").replaceAll("ordine_id text", "ordine_id uuid").replaceAll("order_id text", "order_id uuid")
    .replaceAll("orders(id text", "orders(id uuid").replace(/'(a|b|o1|o2|altro-ordine)'/g, (_m,id:string) => `'${ids[id]}'`);
}
const db = { exec: (sql:string) => pg.exec(fixtureSQL(sql)), query: <T>(sql:string) => pg.query<T>(fixtureSQL(sql)), close: () => pg.close() };
const migration = readFileSync("supabase/migrations/20290316100000_fatture_emesse_elenco_operativo.sql", "utf8");
const letturaIndicizzata = readFileSync("supabase/migrations/20290316111000_fatture_emesse_commesse_lettura_indicizzata.sql", "utf8");
const aggregatiFacoltativi = readFileSync("supabase/migrations/20290316111500_fatture_emesse_aggregati_solo_quando_servono.sql", "utf8");
const proiezioneCanonica = readFileSync("supabase/migrations/20290316112000_fatture_emesse_commesse_proiezione_canonica.sql", "utf8");
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon; create role service_role;
    create table documenti_fiscali_elenco_con_importate(id text primary key, company_id text default 'a', origine text default 'nativa',
      stato text default 'emessa', tipo text default 'fattura', note_documento text, totale_da_pagare numeric default 1000,
      importo_pagato numeric default 0, data_scadenza date);
    create table documenti_fiscali(id text primary key, company_id text default 'a', note_interne text, metodo_pagamento_nome text,
      metodo_pagamento_codice text, ordine_id text, pdf_url text, scadenze_pagamento jsonb default '[]', allegati jsonb default '[]',
      totale_da_pagare numeric, totale_documento numeric, documento_correlato_id text, tipo text default 'fattura',
      stato text default 'emessa', sdi_stato text, deleted_at timestamptz);
    create table invoices(id text primary key, company_id text default 'a', note_interne text, payment_method text, order_id text, pdf_url text, piano_pagamento jsonb default '[]');
    create table fattura_allegati(id serial, company_id text default 'a', documento_fiscale_id text, invoice_id text);
    create table orders(id text primary key, company_id text default 'a', order_code text, description text, deleted_at timestamptz);
    create table fattura_ordine(id serial, company_id text default 'a', fattura_id text, ordine_id text);
  `);
  for (const table of ["documenti_fiscali_elenco_con_importate", "documenti_fiscali", "invoices", "fattura_allegati", "orders", "fattura_ordine"]) {
    await db.exec(`alter table ${table} enable row level security;
      create policy tenant on ${table} for select to authenticated using(company_id='a');
      grant select on ${table} to authenticated;`);
  }
  await db.exec(`create schema if not exists private; grant usage on schema private to authenticated,service_role;
    create view public.orders_visibili with(security_invoker=true,security_barrier=true) as select * from orders;
    grant select on public.orders_visibili to authenticated,service_role;`);
  await db.exec(migration);
  await db.exec(migration); // riapplicazione idempotente
  await db.exec(letturaIndicizzata);
  await db.exec(letturaIndicizzata);
  await db.exec(aggregatiFacoltativi);
  await db.exec(aggregatiFacoltativi);
  await db.exec(proiezioneCanonica);
  await db.exec(proiezioneCanonica);
}, 30000);
afterAll(() => db.close());

describe("Elenco operativo: SQL reale senza modificare fatture", () => {
  it("due commesse e più allegati non duplicano la riga; gli storni rispettano le regole canoniche", async () => {
    await db.exec(`insert into documenti_fiscali_elenco_con_importate(id,importo_pagato) values('n',200);
      insert into documenti_fiscali(id,note_interne,ordine_id) values('n','Nota riservata','o1');
      insert into orders(id,order_code) values('o1','C-1'),('o2','C-2');
      insert into fattura_ordine(fattura_id,ordine_id) values('n','o1'),('n','o2');
      insert into fattura_allegati(documento_fiscale_id) values('n'),('n');
      insert into documenti_fiscali(id,tipo,documento_correlato_id,totale_da_pagare,stato,sdi_stato)
      values ('nc1','nota_credito','n',100,'emessa',null),('nc2','nota_credito','n',500,'bozza',null),
        ('nc3','nota_credito','n',500,'rifiutata',null),('nc4','nota_credito','n',500,'emessa','NS');`);
    const r = await db.query<{commesse: unknown[]; elenco_allegati: number; stornato: string; elenco_residuo: string; note_interne: string}>("select * from documenti_fiscali_elenco_operativo where id='n'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].commesse).toHaveLength(2);
    expect(Number(r.rows[0].elenco_allegati)).toBe(2);
    expect(Number(r.rows[0].stornato)).toBe(100);
    expect(Number(r.rows[0].elenco_residuo)).toBe(700);
    expect(r.rows[0].note_interne).toBe("Nota riservata");
  });

  it("importate: non sottrae nuovamente le note di credito già considerate nell'hub", async () => {
    await db.exec(`insert into documenti_fiscali_elenco_con_importate(id,origine,totale_da_pagare,importo_pagato) values('i','importata',900,200);
      insert into invoices(id,note_interne,order_id) values('i','Nota importata','o1');
      insert into fattura_allegati(invoice_id) values('i');`);
    const r = (await db.query<{elenco_residuo:string; stornato:string; elenco_allegati:number}>("select * from documenti_fiscali_elenco_operativo where id='i'")).rows[0];
    expect(Number(r.stornato)).toBe(0); expect(Number(r.elenco_residuo)).toBe(700); expect(Number(r.elenco_allegati)).toBe(1);
  });

  it("la prossima scadenza è la prima rata aperta; non ripropone rate saldate", async () => {
    await db.exec(`update documenti_fiscali set scadenze_pagamento='[{"data_scadenza":"2026-01-01","pagato":true},{"data_scadenza":"2026-12-01","pagato":false}]' where id='n';
      update invoices set piano_pagamento='[{"scadenza":"2026-01-01","pagata_il":"2026-01-01"},{"scadenza":"2026-12-03"}]' where id='i';`);
    const righe = (await db.query<{id:string; scadenza:string}>("select id, elenco_prossima_scadenza::text scadenza from documenti_fiscali_elenco_operativo where id in ('n','i') order by id")).rows;
    expect(righe).toEqual([{id:"i",scadenza:"2026-12-03"},{id:"n",scadenza:"2026-12-01"}]);
  });

  it("ricerca le note oltre 200 risultati prima di conteggio e paginazione", async () => {
    await db.exec(`insert into documenti_fiscali_elenco_con_importate(id) select 'pagina-'||g from generate_series(1,225) g;
      insert into documenti_fiscali(id,note_interne) select 'pagina-'||g,'Collaudo oltre duecento' from generate_series(1,225) g;`);
    const r = await db.query<{total:number}>("select count(*) over()::int total from documenti_fiscali_elenco_operativo where company_id='a' and note_interne ilike '%duecento%' order by id limit 25 offset 200");
    expect(r.rows).toHaveLength(25); expect(r.rows[0].total).toBe(225);
  });

  it("non espone le note o i collegamenti di altre aziende; anon resta escluso", async () => {
    await db.exec(`insert into documenti_fiscali_elenco_con_importate(id,company_id) values('segreta','b');
      insert into documenti_fiscali(id,company_id,note_interne) values('segreta','b','Riservata');
      insert into orders(id,company_id,order_code) values('altro-ordine','b','SEGRETO');
      insert into fattura_ordine(company_id,fattura_id,ordine_id) values('b','n','altro-ordine');
      set role authenticated;`);
    try {
      expect((await db.query<{id:string; commesse: {codice:string}[] }>("select id, commesse from documenti_fiscali_elenco_operativo")).rows.every(r=>r.id!=="segreta" && !r.commesse.some(c=>c.codice==="SEGRETO"))).toBe(true);
      await db.exec("set role anon;");
      await expect(db.query("select * from documenti_fiscali_elenco_operativo")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("il conteggio non rilegge le commesse con le loro policy, ma le controlla quando vengono mostrate", async () => {
    await db.exec(`create sequence conteggi_policy_ordine;
      create function conta_policy_ordine() returns boolean language plpgsql volatile security definer set search_path=public as $$
        begin perform nextval('conteggi_policy_ordine'); return true; end $$;
      alter policy tenant on orders using(company_id='a' and conta_policy_ordine());
      set role authenticated;`);
    try { await db.query("select count(*) from documenti_fiscali_elenco_operativo where company_id='a'"); }
    finally { await db.exec("reset role"); }
    expect((await db.query<{is_called:boolean}>("select is_called from conteggi_policy_ordine")).rows[0].is_called).toBe(false);
    await db.exec("set role authenticated;");
    try { expect((await db.query<{commesse:unknown[]}>("select commesse from documenti_fiscali_elenco_operativo where id='n'")).rows[0].commesse).toHaveLength(2); }
    finally { await db.exec("reset role"); }
    expect((await db.query<{is_called:boolean}>("select is_called from conteggi_policy_ordine")).rows[0].is_called).toBe(true);
  });
  it("non amplia i permessi quando la fattura è visibile ma una commessa è esclusa", async () => {
    await db.exec("alter policy tenant on orders using(company_id='a' and id<>'o2'); set role authenticated;");
    try {
      const r = (await db.query<{commesse:{codice:string}[]}>("select commesse from documenti_fiscali_elenco_operativo where id='n'")).rows[0];
      expect(r.commesse.map(c=>c.codice)).toEqual(["C-1"]);
      expect((await db.query("select private.fattura_commessa_visibile('o1','b') c")).rows).toEqual([{c:null}]);
    } finally { await db.exec("reset role"); }
    const flags = (await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where proname='fattura_commessa_visibile'")).rows;
    expect(flags).toEqual([{prosecdef:false}]);
  });
});
