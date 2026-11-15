// La migrazione 20290404210000: numero DDT confrontabile (gemello di shared/acquisti),
// aggancio fattura ↔ bolla senza AI, documenti fuori sequenza, annullamento, anteprima,
// isolamento fra aziende, traccia e storia. Database vero (PGlite), nessuna chiamata AI.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { numeroDocumento } from "../../../shared/acquisti/normalizza.ts";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [AZ, ALTRA, FORN, FORN2, UTENTE] = [1, 2, 3, 4, 5].map(id);
let db: PGlite;

const xml = (ddt: Array<[string, string]>) =>
  `<p:FatturaElettronica xmlns:p="x"><FatturaElettronicaBody><DatiGenerali>${ddt
    .map(([n, d]) => `<DatiDDT><NumeroDDT>${n}</NumeroDDT><DataDDT>${d}</DataDDT></DatiDDT>`)
    .join("")}</DatiGenerali></FatturaElettronicaBody></p:FatturaElettronica>`;

async function fattura(n: number, ddt: Array<[string, string]>, over: { company?: string; fornitore?: string | null; tipo?: string } = {}) {
  await db.query(
    `insert into fatture_ricevute(id, company_id, fornitore_id, tipo_documento, xml_raw, righe) values ($1,$2,$3,$4,$5,'[]')`,
    [id(n), over.company ?? AZ, over.fornitore === undefined ? FORN : over.fornitore, over.tipo ?? "TD01", xml(ddt)],
  );
  await db.query(`select fattura_collega_ddt_e_mezzi($1)`, [id(n)]);
}
async function bolla(n: number, numero: string, data: string, over: { company?: string; fornitore?: string } = {}) {
  await db.query(`insert into ddt_ricezione(id, company_id, supplier_id, numero_ddt, data_ricezione) values ($1,$2,$3,$4,$5)`, [
    id(n),
    over.company ?? AZ,
    over.fornitore ?? FORN,
    numero,
    data,
  ]);
}
async function aggancio(fatt: number) {
  const r = await db.query<{ numero_ddt: string; ddt_ricezione_id: string | null }>(
    `select numero_ddt, ddt_ricezione_id from fattura_ddt where fattura_ricevuta_id=$1 order by numero_ddt`,
    [id(fatt)],
  );
  return r.rows.map((x) => [x.numero_ddt, x.ddt_ricezione_id]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role', coalesce(nullif(current_setting('test.role',true),''),'authenticated'))$$;
    create function utente_bloccato() returns boolean language sql stable as $$select false$$;
    create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
    create function e_super_admin_dentro(c uuid) returns boolean language sql stable as $$select false$$;
    create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
    create function aziende_con_permesso(p text) returns uuid[] language sql stable as $$select case when p='can_manage_purchasing' and auth.uid() is not null then array[nullif(current_setting('test.company',true),'')::uuid] else '{}'::uuid[] end$$;
    create function e_nota_credito_ricevuta(p text) returns boolean language sql immutable as $$select coalesce(p,'') in ('TD04','TD08')$$;
    create function e_autofattura_ricevuta(p text) returns boolean language sql immutable as $$select false$$;
    create function importo_legame_mezzo(a numeric, n integer, t numeric, nota boolean) returns numeric language sql immutable as $$select a$$;
    create table companies(id uuid primary key);
    create table mezzi(id uuid primary key, company_id uuid, targa text, matricola text, deleted_at timestamptz);
    create table fatture_ricevute(id uuid primary key, company_id uuid, fornitore_id uuid, tipo_documento text, xml_raw text, righe jsonb, imponibile_totale numeric);
    create table fattura_ricevuta_mezzi(id uuid primary key default gen_random_uuid(), company_id uuid, fattura_ricevuta_id uuid, mezzo_id uuid, importo numeric, origine text, created_by uuid, unique(fattura_ricevuta_id, mezzo_id));
    create table ddt_ricezione(id uuid primary key default gen_random_uuid(), company_id uuid, supplier_id uuid, numero_ddt text, data_ricezione date);
    create table fattura_ddt(id uuid primary key default gen_random_uuid(), company_id uuid, fattura_ricevuta_id uuid, numero_ddt text, data_ddt date, ddt_ricezione_id uuid, origine text, created_by uuid, created_at timestamptz default clock_timestamp());
    create unique index fattura_ddt_unico on fattura_ddt(fattura_ricevuta_id, numero_ddt, coalesce(data_ddt, '0001-01-01'::date));
  `);
  await db.query(`insert into companies values ($1),($2)`, [AZ, ALTRA]);
  await db.exec(readFileSync("supabase/migrations/20290404210000_acquisti_collegamenti_traccia.sql", "utf8"));
}, 60_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`truncate acquisti_collegamenti, acquisti_collegamenti_storia, fattura_ddt, ddt_ricezione, fatture_ricevute cascade;
    select set_config('test.user','',false), set_config('test.company','',false), set_config('test.role','service_role',false), set_config('test.readonly','false',false);`);
});

describe("numero di documento: SQL uguale al TypeScript", () => {
  const casi = [
    "1068", "001068/26", "DDT n. 001068/2026", "9.363", "1068/2025", "2026/000123", "ODA-2026-0039", "A/123", "123/B",
    "123 del 07/09/2026", "N°45", "Nr. 0012", ".", "NO.ORD.", "MARIO ROSSI", "0000", "123-45", "FV 12", "bolla 77",
  ];
  it.each(casi)("%s", async (v) => {
    const ts = numeroDocumento(v);
    const { rows } = await db.query<{ chiave: string | null; anno: number | null; serie: string | null }>(
      `select * from acquisti_numero_documento($1)`,
      [v],
    );
    expect(rows[0]).toEqual({ chiave: ts?.chiave ?? null, anno: ts?.anno ?? null, serie: ts?.serie ?? null });
  });
});

describe("fattura ↔ bolla senza AI", () => {
  it("numero scritto diverso («9.363» / «9363», «1068/26» / «1068»): agganciata, con la traccia", async () => {
    await bolla(10, "9.363", "2026-10-16");
    await bolla(11, "1068", "2026-09-08");
    await fattura(20, [["9363", "2026-10-16"], ["1068/26", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068/26", id(11)], ["9363", id(10)]]);
    const t = await db.query<{ regola: string; stato: string; autore_tipo: string; n: number }>(
      `select regola, stato, autore_tipo, (select count(*)::int from acquisti_collegamenti_storia s where s.collegamento_id=c.id) n from acquisti_collegamenti c order by a_id`,
    );
    expect(t.rows).toEqual([
      { regola: "xml_ddt_numero_data_fornitore", stato: "collegato", autore_tipo: "processo", n: 1 },
      { regola: "xml_ddt_numero_data_fornitore", stato: "collegato", autore_tipo: "processo", n: 1 },
    ]);
  });

  it("stesso numero da un altro fornitore o di un altro anno: non si aggancia", async () => {
    await bolla(10, "1068", "2026-09-08", { fornitore: FORN2 });
    await bolla(11, "1068", "2025-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
  });

  it("data lontana: resta da confermare, non si aggancia da sola", async () => {
    await bolla(10, "1068", "2026-11-30");
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
    const { rows } = await db.query<{ esito: string }>(`select esito from acquisti_collega_ddt($1, $2, null, false)`, [AZ, id(20)]);
    expect(rows[0].esito).toBe("proposta");
  });

  it("documento arrivato prima: la bolla registrata dopo trova la fattura che l'aspettava", async () => {
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
    await bolla(10, "1068", "2026-09-08");
    expect(await aggancio(20)).toEqual([["1068", id(10)]]);
  });

  it("isolamento fra aziende: la bolla di un'altra azienda non c'entra", async () => {
    await bolla(10, "1068", "2026-09-08", { company: ALTRA });
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
  });

  it("bolla già agganciata a un'altra fattura (documento doppio): non si aggancia da sola", async () => {
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    await fattura(21, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", id(10)]]);
    expect(await aggancio(21)).toEqual([["1068", null]]);
    // …ma la nota di credito che storna quella fattura sì.
    await fattura(22, [["1068", "2026-09-07"]], { tipo: "TD04" });
    expect(await aggancio(22)).toEqual([["1068", id(10)]]);
  });

  it("ritentato: rifare il lavoro non crea doppioni", async () => {
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    await db.query(`select fattura_collega_ddt_e_mezzi($1)`, [id(20)]);
    await db.query(`select acquisti_ricollega_ddt_lotto($1)`, [AZ]);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int n from acquisti_collegamenti`);
    expect(rows[0].n).toBe(1);
  });

  it("annullamento: toglie l'aggancio, resta nella storia col motivo, e non si rifà da solo", async () => {
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti`)).rows[0].id;
    await expect(db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','')`, [c])).rejects.toThrow(/Scrivi perché/);
    await expect(db.query(`select acquisti_collegamento_cambia_stato($1,'pagato','x')`, [c])).rejects.toThrow(/non si passa/);
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','bolla di un altro cantiere')`, [c]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
    await db.query(`select acquisti_ricollega_ddt_lotto($1)`, [AZ]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
    // Ripensamento: riproposto e ricollegato a mano, la bolla torna sulla riga.
    await db.query(`select acquisti_collegamento_cambia_stato($1,'proposto')`, [c]);
    await db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [c]);
    expect(await aggancio(20)).toEqual([["1068", id(10)]]);
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','di nuovo no')`, [c]);
    const s = await db.query<{ stato_prima: string | null; stato_dopo: string; motivo: string | null }>(
      `select stato_prima, stato_dopo, motivo from acquisti_collegamenti_storia order by creato_il`,
    );
    expect(s.rows).toEqual([
      { stato_prima: null, stato_dopo: "collegato", motivo: null },
      { stato_prima: "collegato", stato_dopo: "annullato", motivo: "bolla di un altro cantiere" },
      { stato_prima: "annullato", stato_dopo: "proposto", motivo: null },
      { stato_prima: "proposto", stato_dopo: "collegato", motivo: null },
      { stato_prima: "collegato", stato_dopo: "annullato", motivo: "di nuovo no" },
    ]);
  });

  it("stati distinti: collegato → verificato → approvato per il pagamento → pagato", async () => {
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti`)).rows[0].id;
    for (const s of ["verificato", "approvato_pagamento", "pagato"]) await db.query(`select acquisti_collegamento_cambia_stato($1,$2)`, [c, s]);
    await expect(db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','x')`, [c])).rejects.toThrow(/non si passa/);
  });

  it("anteprima: dice cosa cambierebbe e non scrive", async () => {
    await fattura(20, [["1068", "2026-09-07"], ["2001", "2026-10-01"]]);
    await db.exec(`alter table ddt_ricezione disable trigger acquisti_ddt_cerca_fatture`);
    await bolla(10, "1068", "2026-09-08");
    await db.exec(`alter table ddt_ricezione enable trigger acquisti_ddt_cerca_fatture`);
    const { rows } = await db.query<{ v: { esaminate: number; si_collegherebbero: number; senza_bolla: number } }>(
      `select acquisti_ricollega_ddt_anteprima($1) v`,
      [AZ],
    );
    expect(rows[0].v).toMatchObject({ esaminate: 2, si_collegherebbero: 1, senza_bolla: 1 });
    expect(await aggancio(20)).toEqual([["1068", null], ["2001", null]]);
    const lotto = await db.query<{ v: { collegate: number } }>(`select acquisti_ricollega_ddt_lotto($1) v`, [AZ]);
    expect(lotto.rows[0].v.collegate).toBe(1);
  });

  it("permessi: l'anteprima di un'altra azienda è rifiutata; la sola lettura non scrive", async () => {
    await db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${AZ}',false)`);
    await expect(db.query(`select acquisti_ricollega_ddt_anteprima($1)`, [ALTRA])).rejects.toThrow(/permesso/);
    await db.query(`select acquisti_ricollega_ddt_anteprima($1)`, [AZ]);
    await db.exec(`select set_config('test.readonly','true',false)`);
    await expect(db.query(`select acquisti_ricollega_ddt_lotto($1)`, [AZ])).rejects.toThrow(/permesso/);
  });

  it("la traccia non si scrive dal browser", async () => {
    const { rows } = await db.query<{ ins: boolean; upd: boolean; sel: boolean }>(
      `select has_table_privilege('authenticated','acquisti_collegamenti','insert') ins, has_table_privilege('authenticated','acquisti_collegamenti','update') upd, has_table_privilege('authenticated','acquisti_collegamenti','select') sel`,
    );
    expect(rows[0]).toEqual({ ins: false, upd: false, sel: true });
  });
});
