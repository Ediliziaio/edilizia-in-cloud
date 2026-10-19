import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getScadenzaInfo, giornoItaliano, ricercaDocumenti, STATI_FILTRO_DOCUMENTI } from "@/lib/fatturazione/filtriDocumenti";
import { faseSdi, TIPI_SDI, type DocFaseSdi } from "@/lib/fatturazione/sdiCassetto";

const db = new PGlite();
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261019085714_documenti_filtri_elenco.sql"), "utf8");
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon;
    create table documenti_fiscali(id serial primary key, company_id text default 'a', tipo text default 'fattura',
      stato text default 'inviata_sdi', sdi_stato text, sdi_id_trasmissione text, trasmissione text,
      data_scadenza date, totale_da_pagare numeric default 100, importo_pagato numeric,
      deleted_at timestamptz, cliente_snapshot jsonb default '{}');
    alter table documenti_fiscali enable row level security;
    create policy tenant_read on documenti_fiscali for select to authenticated using(company_id='a');
    grant select on documenti_fiscali to authenticated;
  `);
  await db.exec(migration);
}, 30000);
afterAll(() => db.close());

describe("Scadenza: calendario italiano e residuo, non il solo stato salvato", () => {
  const doc = { data_scadenza: "2026-10-16", stato: "inviata_sdi" as const, totale_da_pagare: 13900, importo_pagato: 0 };
  it("FPR 5/26 inviata SDI ma scaduta da tre giorni", () => {
    expect(getScadenzaInfo(doc, new Date("2026-10-19T08:00:00Z"))).toMatchObject({scaduta:true,giorni:3});
  });
  it.each(["2026-03-28T23:30:00Z", "2026-10-24T22:30:00Z"])("non perde un giorno al cambio ora: %s", now => {
    const date = new Date(now);
    const yesterday = new Date(`${giornoItaliano(date)}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate()-1);
    expect(getScadenzaInfo({...doc,data_scadenza:yesterday.toISOString().slice(0,10)},date)?.giorni).toBe(1);
  });
  it("scade solo dal giorno successivo, non durante il giorno di scadenza", () => {
    expect(getScadenzaInfo(doc,new Date("2026-10-16T21:59:59Z"))).toMatchObject({scaduta:false,giorni:0});
    expect(getScadenzaInfo(doc,new Date("2026-10-16T22:00:00Z"))).toMatchObject({scaduta:true,giorni:1});
  });
  it.each(["bozza","annullata","stornata","pagata"] as const)("%s non ha una scadenza da incassare", stato => {
    expect(getScadenzaInfo({...doc,stato})).toBeNull();
  });
  it("non segnala saldate, sovrapagate, eliminate o senza data", () => {
    expect(getScadenzaInfo({...doc,importo_pagato:13900})).toBeNull();
    expect(getScadenzaInfo({...doc,importo_pagato:14000})).toBeNull();
    expect(getScadenzaInfo({...doc,deleted_at:"2026-10-01"})).toBeNull();
    expect(getScadenzaInfo({...doc,data_scadenza:undefined})).toBeNull();
  });
  it("la parzialmente pagata resta scaduta finché c'è residuo", () => {
    expect(getScadenzaInfo({...doc,stato:"parzialmente_pagata",importo_pagato:100},new Date("2026-10-19T08:00:00Z"))?.scaduta).toBe(true);
  });
});

describe("Ricerca letterale sicura, inclusi punteggiatura e privati", () => {
  it.each(['Rossi, Mario (S.r.l.)','Quote:"test"','C:\\clienti','100%_reale*','a)|numero.eq.qualunque','FPR 74/26','[A-Z]+$'])('%s resta un solo valore PostgREST e una regex letterale', async term => {
    const filter = ricercaDocumenti(term)!;
    // Decodifica la stringa quotata nello stesso modo della grammatica PostgREST.
    const quoted = filter.slice("numero.imatch.".length, filter.indexOf(",note_documento"));
    expect(quoted[0]).toBe('"'); expect(quoted.at(-1)).toBe('"');
    const regex = quoted.slice(1,-1).replace(/\\([\\"])/g,"$1");
    expect((await db.query<{ok:boolean}>("select $1::text ~* $2 as ok",[term,regex])).rows[0].ok).toBe(true);
    expect((await db.query<{ok:boolean}>("select $1::text ~* $2 as ok",["un altro valore",regex])).rows[0].ok).toBe(false);
    expect(filter).toContain("elenco_cliente.imatch.");
  });
  it("spazi vuoti non inviano un filtro universale", () => expect(ricercaDocumenti("  ")).toBeUndefined());
  it("tutte le scelte SDI sono disponibili anche al telefono", () => {
    expect(STATI_FILTRO_DOCUMENTI.filter(x=>x.value.startsWith("sdi:")).map(x=>x.value)).toEqual(["sdi:da_inviare","sdi:in_elaborazione","sdi:scartata"]);
  });
});

describe("View SQL reale: fase SDI, scadenza, conteggio, paginazione e RLS", () => {
  const cases: DocFaseSdi[] = [
    {stato:"bozza",sdi_stato:"AT"}, {stato:"annullata",sdi_stato:"NS"},
    {stato:"in_invio",sdi_stato:"AT"}, {stato:"emessa"},
    {stato:"emessa",sdi_id_trasmissione:"  "},
    {stato:"pagata",sdi_stato:"AT"}, {stato:"inviata_sdi",sdi_id_trasmissione:"provider-id"},
    {stato:"inviata_sdi",sdi_stato:" mc "}, {stato:"inviata_sdi",sdi_stato:"RC"},
    {stato:"accettata",sdi_stato:"EC01"}, {stato:"accettata",sdi_stato:"DT"},
    {stato:"rifiutata",sdi_stato:"EC02"}, {stato:"rifiutata",sdi_stato:" ns "},
    {stato:"emessa",trasmissione:"manuale",sdi_stato:"AT"},
    {stato:"emessa",sdi_id_trasmissione:"MAN-123",sdi_stato:"NS"},
    {tipo:"proforma",stato:"emessa",sdi_stato:"AT"}, {tipo:"ddt",stato:"emessa"},
    {stato:null}, {tipo:"non_fiscale",stato:"emessa"},
  ];
  it.each(cases)("stessa fase dei badge: %j", async c => {
    const doc = {tipo:"fattura",...c};
    const result = await db.query<{elenco_fase_sdi:string|null}>(`with inserted as (
      insert into documenti_fiscali(tipo,stato,sdi_stato,sdi_id_trasmissione,trasmissione)
      values($1,$2,$3,$4,$5) returning id) select id from inserted`,[doc.tipo,doc.stato??null,doc.sdi_stato??null,doc.sdi_id_trasmissione??null,doc.trasmissione??null]);
    const id = (result.rows[0] as unknown as {id:number}).id;
    const phase = (await db.query<{elenco_fase_sdi:string|null}>("select elenco_fase_sdi from documenti_fiscali_elenco where id=$1",[id])).rows[0].elenco_fase_sdi;
    expect(phase).toBe(faseSdi(doc)?.fase ?? null);
  });
  it.each(TIPI_SDI)("supporta il tipo SDI %s", async tipo => {
    const id = (await db.query<{id:number}>("insert into documenti_fiscali(tipo,stato) values($1,'emessa') returning id",[tipo])).rows[0].id;
    expect((await db.query<{fase:string}>("select elenco_fase_sdi fase from documenti_fiscali_elenco where id=$1",[id])).rows[0].fase).toBe("da_inviare");
  });
  it("scadute prima di limit: nessun documento perso tra le pagine", async () => {
    await db.exec(`insert into documenti_fiscali(company_id,data_scadenza,sdi_stato)
      select 'pages',(now() at time zone 'Europe/Rome')::date-3,'MC' from generate_series(1,31);
      insert into documenti_fiscali(company_id,data_scadenza,stato,importo_pagato)
      values ('pages',current_date-3,'bozza',0),('pages',current_date-3,'pagata',100),('pages',current_date-3,'inviata_sdi',100),
        ('pages',current_date+3,'inviata_sdi',0),('pages',null,'emessa',0);`);
    const first = await db.query<{id:number;total:number}>("select id,count(*) over()::int total from documenti_fiscali_elenco where company_id='pages' and elenco_scaduta order by id limit 25");
    const last = await db.query<{id:number}>("select id from documenti_fiscali_elenco where company_id='pages' and elenco_scaduta order by id limit 25 offset 25");
    expect(first.rows).toHaveLength(25); expect(first.rows[0].total).toBe(31); expect(last.rows).toHaveLength(6);
    expect(new Set([...first.rows,...last.rows].map(x=>x.id)).size).toBe(31);
  });
  it("nome e cognome vengono cercati insieme anche senza ragione sociale", async () => {
    const id = (await db.query<{id:number}>(`insert into documenti_fiscali(cliente_snapshot) values ('{"nome":"Mario","cognome":"Rossi"}') returning id`)).rows[0].id;
    expect((await db.query<{elenco_cliente:string}>("select elenco_cliente from documenti_fiscali_elenco where id=$1",[id])).rows[0].elenco_cliente).toBe("Mario Rossi");
  });
  it("RLS non permette ad authenticated di vedere un'altra azienda; anon non accede", async () => {
    await db.exec("insert into documenti_fiscali(company_id) values('segreta'); set role authenticated;");
    try {
      expect((await db.query<{company_id:string}>("select company_id from documenti_fiscali_elenco")).rows.every(x=>x.company_id==='a')).toBe(true);
      await expect(db.exec("update documenti_fiscali_elenco set stato='pagata'")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
    await db.exec("set role anon");
    try { await expect(db.exec("select * from documenti_fiscali_elenco")).rejects.toThrow(/permission denied/); }
    finally { await db.exec("reset role"); }
  });
});
