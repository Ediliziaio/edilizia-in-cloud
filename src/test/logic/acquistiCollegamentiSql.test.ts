// La migrazione 20290404210000: numero DDT confrontabile (gemello di shared/acquisti),
// aggancio fattura ↔ bolla senza AI, documenti fuori sequenza, annullamento, anteprima,
// isolamento fra aziende, traccia e storia. Database vero (PGlite), nessuna chiamata AI.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { numeroDocumento } from "../../../shared/acquisti/normalizza.ts";
import { ddtNelleDescrizioni, leggiRiferimentiFattura } from "../../../shared/acquisti/riferimentiFattura.ts";

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
    create table fatture_ricevute(id uuid primary key, company_id uuid, fornitore_id uuid, tipo_documento text, xml_raw text, righe jsonb, imponibile_totale numeric, data_fattura date,
      cedente_piva text, cedente_cf text, totale_documento numeric, purchase_order_id uuid, aggancio_oda_manuale boolean default false, stato text);
    create table suppliers(id uuid primary key default gen_random_uuid(), company_id uuid, vat_number text, fiscal_code text);
    create table purchase_orders(id uuid primary key, company_id uuid, supplier_id uuid, oda_number text, status text, total numeric, subtotal numeric, issue_date date);
    create table fattura_ricevuta_ordini(fattura_id uuid, purchase_order_id uuid);
    create function partner_tax_key(v text) returns text language sql immutable as $$
      select case when x ~ '^IT[0-9]{11}$' then substr(x,3) else x end from (select regexp_replace(upper(coalesce(v,'')), '[^A-Z0-9]', '', 'g') x) s $$;
    -- Come in produzione, ridotta all'osso: collega (o scollega) e segna la scelta come manuale.
    create function collega_fattura_a_ordini(p_fattura_id uuid, p_quote jsonb) returns jsonb language sql as $$
      update fatture_ricevute set purchase_order_id = (p_quote->0->>'purchase_order_id')::uuid, aggancio_oda_manuale = true where id = p_fattura_id
      returning jsonb_build_object('ordini', jsonb_array_length(p_quote)) $$;
    create table fattura_ricevuta_mezzi(id uuid primary key default gen_random_uuid(), company_id uuid, fattura_ricevuta_id uuid, mezzo_id uuid, importo numeric, origine text, created_by uuid, unique(fattura_ricevuta_id, mezzo_id));
    create table ddt_ricezione(id uuid primary key default gen_random_uuid(), company_id uuid, supplier_id uuid, numero_ddt text, data_ricezione date);
    create table fattura_ddt(id uuid primary key default gen_random_uuid(), company_id uuid, fattura_ricevuta_id uuid, numero_ddt text, data_ddt date, ddt_ricezione_id uuid, origine text, created_by uuid, created_at timestamptz default clock_timestamp());
    create table orders(id uuid primary key, company_id uuid, deleted_at timestamptz);
    create table company_governance_settings(company_id uuid primary key);
    create table invoices(id uuid primary key, company_id uuid);
    create table scadenze(id uuid primary key, company_id uuid);
    create table order_installments(id uuid primary key, order_id uuid);
    create function user_can_access_company(c uuid) returns boolean language sql stable as $$select c=nullif(current_setting('test.company',true),'')::uuid$$;
    create function get_my_company_id() returns uuid language sql stable as $$select nullif(current_setting('test.company',true),'')::uuid$$;
    create function puo_vedere_documenti_fornitore() returns boolean language sql stable as $$select auth.uid() is not null and coalesce(current_setting('test.documenti',true),'') <> 'no'$$;
    create function puo_registrare_costi(c uuid) returns boolean language sql stable as $$select auth.uid() is not null and c = nullif(current_setting('test.company',true),'')::uuid$$;
    create unique index fattura_ddt_unico on fattura_ddt(fattura_ricevuta_id, numero_ddt, coalesce(data_ddt, '0001-01-01'::date));
  `);
  await db.query(`insert into companies values ($1),($2)`, [AZ, ALTRA]);
  await db.exec(readFileSync("supabase/migrations/20290404210000_acquisti_collegamenti_traccia.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404220000_acquisti_collegamento_registra.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404240000_collegamento_automatico_interruttore.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404250000_acquisti_collega_ddt_proposta_promossa.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404260000_acquisti_tipi_tesoreria.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404270000_acquisti_misura_collegamenti.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404290000_acquisti_ddt_nelle_descrizioni.sql", "utf8"));
  // Il trigger di produzione su cui la migrazione 300000 cambia la funzione.
  await db.exec(`create function aggancia_fattura_a_oda() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger trg_fatture_ricevute_aggancia_oda before insert or update of cedente_piva, cedente_cf, totale_documento, imponibile_totale, tipo_documento
      on fatture_ricevute for each row when (new.purchase_order_id is null and coalesce(new.aggancio_oda_manuale, false) = false) execute function aggancia_fattura_a_oda();`);
  await db.exec(readFileSync("supabase/migrations/20290404300000_acquisti_ordine_da_importo.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404301000_aggancia_fattura_a_oda_definer.sql", "utf8"));
  // Fattura → commessa (306000) e correzioni della revisione (309000).
  await db.exec(`
      alter table fatture_ricevute add column if not exists company_cost_id uuid, add column if not exists order_id_suggerito uuid,
        add column if not exists updated_at timestamptz;
      create table if not exists company_costs(id uuid primary key default gen_random_uuid(), company_id uuid, order_id uuid,
        allocations jsonb default '[]', quota_magazzino numeric, purchase_order_id uuid, order_external_team_id uuid, updated_at timestamptz);
      -- Come in produzione, ridotta all'osso: serve una persona col permesso, contabilizza se manca il costo,
      -- una commessa intera va in order_id, una quota in allocations; segna la scelta come manuale.
      create or replace function fattura_collega_commesse(p_fattura_id uuid, p_quote jsonb, p_magazzino numeric default 0, p_magazzino_righe jsonb default null)
      returns jsonb language plpgsql as $$
      declare v uuid; b numeric; n int := jsonb_array_length(p_quote); intera boolean;
      begin
        if auth.uid() is null then raise exception 'Il tuo ruolo non permette di registrare i costi delle commesse.'; end if;
        select company_cost_id, abs(coalesce(imponibile_totale, totale_documento, 0)) into v, b from fatture_ricevute where id = p_fattura_id;
        if v is null then
          insert into company_costs(company_id) select company_id from fatture_ricevute where id = p_fattura_id returning id into v;
          update fatture_ricevute set company_cost_id = v where id = p_fattura_id;
        end if;
        intera := n = 1 and (p_quote->0->>'importo')::numeric >= b - 0.01;
        update company_costs set order_id = case when intera then (p_quote->0->>'order_id')::uuid end,
               allocations = case when n = 0 or intera then '[]'::jsonb else p_quote end where id = v;
        update fatture_ricevute set order_id_suggerito = case when n = 1 then (p_quote->0->>'order_id')::uuid end, aggancio_oda_manuale = true where id = p_fattura_id;
        return '{}'::jsonb;
      end $$;`);
    await db.exec(readFileSync("supabase/migrations/20290404306000_acquisti_commessa_costo_alla_conferma.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404309000_acquisti_ordini_revisione.sql", "utf8"));
}, 60_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`truncate acquisti_collegamenti, acquisti_collegamenti_storia, fattura_ddt, ddt_ricezione, fatture_ricevute, orders, company_governance_settings, invoices, scadenze, order_installments, suppliers, purchase_orders, fattura_ricevuta_ordini, company_costs cascade;
    select set_config('test.user','',false), set_config('test.company','',false), set_config('test.role','service_role',false), set_config('test.readonly','false',false);`);
  // I casi qui sotto provano le regole con l'interruttore ACCESO; quelli con l'interruttore spento sono in fondo.
  await db.query(`insert into company_governance_settings(company_id, collegamento_automatico) values ($1, true), ($2, true)`, [AZ, ALTRA]);
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

describe("acquisti_collegamento_registra: la porta comune per B, C e D", () => {
  const COMM = id(30), COMM_ALTRA = id(31);
  const registra = (esito: string, a = COMM, regola = "prova_regola") =>
    db.query<{ id: string }>(
      `select acquisti_collegamento_registra($1,'fattura_ricevuta',$2,'3','commessa',$3,null,$4,$5,'[{"campo":"codice","ruolo":"identifica","esito":"uguale","testo":"codice"}]'::jsonb) id`,
      [AZ, id(20), a, regola, esito],
    );
  beforeEach(async () => {
    await db.query(`insert into orders(id, company_id) values ($1,$2),($3,$4)`, [COMM, AZ, COMM_ALTRA, ALTRA]);
    await fattura(20, []);
  });

  it("proposta, poi automatico: stessa riga, passa a collegato, storia di due passi", async () => {
    const a = (await registra("proposta")).rows[0].id;
    const b = (await registra("automatico")).rows[0].id;
    expect(b).toBe(a);
    const { rows } = await db.query<{ stato: string; da_riga: string; n: number }>(
      `select stato, da_riga, (select count(*)::int from acquisti_collegamenti_storia where collegamento_id=c.id) n from acquisti_collegamenti c`,
    );
    expect(rows).toEqual([{ stato: "collegato", da_riga: "3", n: 2 }]);
  });

  it("isolamento: la commessa di un'altra azienda è rifiutata", async () => {
    await expect(registra("automatico", COMM_ALTRA)).rejects.toThrow(/non è di questa azienda/);
  });

  it("esiti non registrabili e regola mancante", async () => {
    await expect(registra("conflitto")).rejects.toThrow(/Esito non valido/);
    await expect(registra("automatico", COMM, "")).rejects.toThrow(/regola/);
    await expect(registra("manuale")).rejects.toThrow(/persona/);
  });

  it("una regola non rifà ciò che una persona ha annullato; una persona sì", async () => {
    const c = (await registra("automatico")).rows[0].id;
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','commessa sbagliata')`, [c]);
    await registra("automatico");
    expect((await db.query<{ stato: string }>(`select stato from acquisti_collegamenti`)).rows[0].stato).toBe("annullato");
    await db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${AZ}',false)`);
    await registra("manuale");
    const r = await db.query<{ stato: string; autore_tipo: string }>(`select stato, autore_tipo from acquisti_collegamenti`);
    expect(r.rows[0]).toEqual({ stato: "collegato", autore_tipo: "utente" });
  });

  it("chi non può collegare non registra", async () => {
    await db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${ALTRA}',false)`);
    await expect(registra("automatico")).rejects.toThrow(/permesso/);
  });
});

describe("interruttore del collegamento automatico (spento di base)", () => {
  beforeEach(async () => {
    await db.query(`update company_governance_settings set collegamento_automatico = false where company_id = $1`, [AZ]);
  });

  it("spento: l'aggancio unico e verificato diventa una proposta; un clic lo collega", async () => {
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
    const c = await db.query<{ id: string; stato: string; esito: string }>(`select id, stato, esito from acquisti_collegamenti`);
    expect(c.rows).toEqual([{ id: c.rows[0].id, stato: "proposto", esito: "proposta" }]);
    await db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [c.rows[0].id]);
    expect(await aggancio(20)).toEqual([["1068", id(10)]]);
  });

  it("proposta scritta da spento, poi l'interruttore si accende: al giro dopo è collegata e la traccia lo dice", async () => {
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    await db.query(`update company_governance_settings set collegamento_automatico = true where company_id = $1`, [AZ]);
    await db.query(`select acquisti_ricollega_ddt_lotto($1)`, [AZ]);
    expect(await aggancio(20)).toEqual([["1068", id(10)]]);
    const t = await db.query(`select stato, esito, (select count(*)::int from acquisti_collegamenti_storia) passi from acquisti_collegamenti`);
    expect(t.rows).toEqual([{ stato: "collegato", esito: "automatico", passi: 2 }]);
  });

  it("riga mancante nelle impostazioni = spento", async () => {
    await db.query(`delete from company_governance_settings where company_id = $1`, [AZ]);
    await bolla(10, "1068", "2026-09-08");
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
  });

  it("spento: la registrazione comune trasforma «automatico» in proposta; acceso lo collega e lo segna automatico", async () => {
    const COMM = id(40);
    await db.query(`insert into orders(id, company_id) values ($1,$2)`, [COMM, AZ]);
    await fattura(20, []);
    const reg = () =>
      db.query<{ id: string }>(`select acquisti_collegamento_registra($1,'fattura_ricevuta',$2,null,'commessa',$3,null,'prova','automatico','[]'::jsonb) id`, [AZ, id(20), COMM]);
    await reg();
    expect((await db.query(`select stato, esito from acquisti_collegamenti`)).rows).toEqual([{ stato: "proposto", esito: "proposta" }]);
    await db.query(`update company_governance_settings set collegamento_automatico = true where company_id = $1`, [AZ]);
    await reg();
    expect((await db.query(`select stato, esito from acquisti_collegamenti`)).rows).toEqual([{ stato: "collegato", esito: "automatico" }]);
  });

  it("gli altri esiti non cambiano: più bolle candidate restano una scelta anche ad interruttore acceso", async () => {
    await db.query(`update company_governance_settings set collegamento_automatico = true where company_id = $1`, [AZ]);
    await bolla(10, "1068", "2026-09-08");
    await bolla(11, "1068/26", "2026-09-09");
    await fattura(20, [["1068", "2026-09-07"]]);
    expect(await aggancio(20)).toEqual([["1068", null]]);
    const { rows } = await db.query<{ esito: string }>(`select esito from acquisti_collega_ddt($1, $2, null, false)`, [AZ, id(20)]);
    expect(rows[0].esito).toBe("scelta");
  });

  it("l'interruttore di un'azienda non vale per un'altra, e chi non vede l'azienda legge «spento»", async () => {
    await db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${AZ}',false)`);
    const { rows } = await db.query<{ a: boolean; b: boolean }>(`select azienda_collegamento_automatico($1) a, azienda_collegamento_automatico($2) b`, [AZ, ALTRA]);
    expect(rows[0]).toEqual({ a: false, b: false });
  });
});

describe("tipi della tesoreria nella traccia comune", () => {
  it("fattura emessa, scadenza e rata di commessa: dell'azienda sì, di un'altra no", async () => {
    const [FATT, SCAD, COMM, COMM2, RATA, RATA2, MOV] = [50, 51, 52, 53, 54, 55, 56].map(id);
    await db.query(`insert into orders(id, company_id) values ($1,$2),($3,$4)`, [COMM, AZ, COMM2, ALTRA]);
    await db.query(`insert into invoices values ($1,$2)`, [FATT, AZ]);
    await db.query(`insert into scadenze values ($1,$2)`, [SCAD, AZ]);
    await db.query(`insert into order_installments values ($1,$2),($3,$4)`, [RATA, COMM, RATA2, COMM2]);
    const dell = async (tipo: string, x: string, az = AZ) =>
      (await db.query<{ ok: boolean }>(`select acquisti_documento_dell_azienda($1,$2,$3) ok`, [tipo, x, az])).rows[0].ok;
    expect(await dell("fattura_emessa", FATT)).toBe(true);
    expect(await dell("fattura_emessa", FATT, ALTRA)).toBe(false);
    expect(await dell("scadenza", SCAD)).toBe(true);
    expect(await dell("rata_commessa", RATA)).toBe(true);
    expect(await dell("rata_commessa", RATA2)).toBe(false);
    expect(await dell("tipo_inventato", FATT)).toBe(false);
    void MOV;
  });
});

describe("misura dei collegamenti per regola", () => {
  it("da soli, confermati, in attesa, corretti e percentuale; solo a chi vede l'azienda", async () => {
    await bolla(10, "1068", "2026-09-08");
    await bolla(11, "1070", "2026-09-10");
    await bolla(12, "1071", "2026-09-11");
    await fattura(20, [["1068", "2026-09-07"]]); // da solo (interruttore acceso)
    await fattura(21, [["1070", "2026-09-10"]]); // da solo, poi annullato
    await db.query(`update company_governance_settings set collegamento_automatico = false where company_id = $1`, [AZ]);
    await fattura(22, [["1071", "2026-09-11"]]); // proposto, resta in attesa
    const annulla = (await db.query<{ id: string }>(`select id from acquisti_collegamenti where da_id = $1`, [id(21)])).rows[0].id;
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','sbagliata')`, [annulla]);
    await db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${AZ}',false)`);
    const { rows } = await db.query<{ m: { regole: Array<Record<string, unknown>> } }>(`select acquisti_misura_collegamenti($1) m`, [AZ]);
    expect(rows[0].m.regole).toEqual([
      { regola: "xml_ddt_numero_data_fornitore", totali: 3, da_soli: 2, confermati: 0, in_attesa: 1, corretti: 1, pct_corretti: 33.3, con_ai: 0 },
    ]);
    await expect(db.query(`select acquisti_misura_collegamenti($1)`, [ALTRA])).rejects.toThrow(/Non puoi vedere/);
  });
});

describe("DDT scritti nelle descrizioni", () => {
  const descrizioni = [
    "Rif. DDT n. 1068 del 07/09/2026 - Cemento",
    "DDT 9.363 del 16-10-26",
    "Bolla nr. 001070",
    "DOC. TRASP. N° 24-008383 DEL 2026-09-30 sabbia",
    "Prezzo 1068 euro, misura 30x40",
    "Consegna con DDT n. del",
  ];
  it("SQL legge gli stessi DDT del TypeScript", async () => {
    const xml = `<FatturaElettronicaBody><DatiBeniServizi>${descrizioni.map((d, i) => `<DettaglioLinee><NumeroLinea>${i + 1}</NumeroLinea><Descrizione>${d}</Descrizione><PrezzoTotale>1</PrezzoTotale></DettaglioLinee>`).join("")}</DatiBeniServizi></FatturaElettronicaBody>`;
    const ts = ddtNelleDescrizioni(leggiRiferimentiFattura(xml).righe).map((d) => `${d.numero!.chiave}|${d.data ?? ""}`).sort();
    const { rows } = await db.query<{ numero: string; data: string | null }>(
      `select numero, to_char(data, 'YYYY-MM-DD') data from acquisti_ddt_dalle_descrizioni($1::jsonb)`,
      [JSON.stringify(descrizioni.map((d) => ({ descrizione: d })))],
    );
    const sql = rows.map((r) => `${numeroDocumento(r.numero)!.chiave}|${r.data ?? ""}`).sort();
    expect(sql).toEqual(ts);
    expect(sql).toEqual(["1068|2026-09-07", "1070|", "24008383|2026-09-30", "9363|2026-10-16"].sort());
  });

  it("fattura senza DatiDDT che cita la bolla nella riga: agganciata; storico con anteprima e lotto", async () => {
    await bolla(10, "1068", "2026-09-08");
    await db.query(`insert into fatture_ricevute(id, company_id, fornitore_id, tipo_documento, xml_raw, righe) values ($1,$2,$3,'TD01',null,$4)`, [
      id(70), AZ, FORN, JSON.stringify([{ descrizione: "Rif. DDT n. 1068 del 07/09/2026 cemento" }]),
    ]);
    // Arrivata prima della modifica: nessuna riga fattura_ddt. L'anteprima la conta, non scrive.
    const a = (await db.query<{ v: { fatture: number; ddt: number } }>(`select acquisti_ddt_descrizioni_anteprima($1) v`, [AZ])).rows[0].v;
    expect(a).toMatchObject({ fatture: 1, ddt: 1 });
    expect(await aggancio(70)).toEqual([]);
    await db.query(`select acquisti_ddt_descrizioni_lotto($1)`, [AZ]);
    expect(await aggancio(70)).toEqual([["1068", id(10)]]);
    const o = (await db.query<{ origine: string }>(`select origine from fattura_ddt where fattura_ricevuta_id = $1`, [id(70)])).rows;
    expect(o).toEqual([{ origine: "descrizione" }]);
    // Rifarlo non aggiunge niente.
    expect((await db.query<{ v: { fatture: number } }>(`select acquisti_ddt_descrizioni_lotto($1) v`, [AZ])).rows[0].v.fatture).toBe(0);
  });

  it("all'arrivo: se l'XML ha DatiDDT le descrizioni non si leggono", async () => {
    await db.query(`insert into fatture_ricevute(id, company_id, fornitore_id, tipo_documento, xml_raw, righe) values ($1,$2,$3,'TD01',$4,$5)`, [
      id(71), AZ, FORN, xml([["555", "2026-09-07"]]), JSON.stringify([{ descrizione: "DDT 1068 del 07/09/2026" }]),
    ]);
    await db.query(`select fattura_collega_ddt_e_mezzi($1)`, [id(71)]);
    expect((await aggancio(71)).map((x) => x[0])).toEqual(["555"]);
  });
});

describe("fattura ↔ ordine per importo uguale (decisione del 15/11)", () => {
  const ODA = id(80), ODA2 = id(81);
  const ordine = (oda: string, numero: string, totale: number) =>
    db.query(`insert into purchase_orders values ($1,$2,(select id from suppliers where vat_number='00743110157'),$3,'ricevuto',$4,$4)`, [oda, AZ, numero, totale]);
  const fatturaOda = (n: number, totale: number, xmlRaw: string | null = null) =>
    db.query(`insert into fatture_ricevute(id, company_id, tipo_documento, cedente_piva, totale_documento, xml_raw) values ($1,$2,'TD01','IT00743110157',$3,$4)`, [id(n), AZ, totale, xmlRaw]);
  const stato = async (n: number) => {
    const f = (await db.query<{ po: string | null }>(`select purchase_order_id po from fatture_ricevute where id = $1`, [id(n)])).rows[0];
    const t = (await db.query<{ regola: string; esito: string; stato: string }>(`select regola, esito, stato from acquisti_collegamenti where da_id = $1`, [id(n)])).rows;
    return { po: f.po, traccia: t };
  };
  beforeEach(async () => {
    await db.query(`insert into suppliers(company_id, vat_number) values ($1, '00743110157')`, [AZ]);
  });
  // Chi conferma dal popup: una persona dell'azienda che vede fatture, costi o fornitori.
  const persona = () =>
    db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${AZ}',false)`);
  const servizio = () => db.exec(`select set_config('test.role','service_role',false), set_config('test.user','',false)`);

  it("solo importo: proposta, anche con l'interruttore acceso; un clic la collega", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await fatturaOda(90, 122);
    expect(await stato(90)).toEqual({ po: null, traccia: [{ regola: "oda_importo_fornitore", esito: "proposta", stato: "proposto" }] });
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti where da_id = $1`, [id(90)])).rows[0].id;
    await persona();
    await db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [c]);
    expect((await stato(90)).po).toBe(ODA);
  });

  it("importo + numero d'ordine citato: acceso si collega da solo, spento resta proposta", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    const x = `<DatiOrdineAcquisto><IdDocumento>ODA-2026-0039</IdDocumento></DatiOrdineAcquisto>`;
    await fatturaOda(91, 122, x);
    expect(await stato(91)).toEqual({ po: ODA, traccia: [{ regola: "oda_numero_importo_fornitore", esito: "automatico", stato: "collegato" }] });
    await db.query(`update company_governance_settings set collegamento_automatico = false where company_id = $1`, [AZ]);
    await ordine(ODA2, "ODA-2026-0040", 50);
    await fatturaOda(92, 50, x.replace("0039", "0040"));
    expect(await stato(92)).toEqual({ po: null, traccia: [{ regola: "oda_numero_importo_fornitore", esito: "proposta", stato: "proposto" }] });
  });

  it("annullare un aggancio dal popup lo scollega e la scelta resta (non si riaggancia)", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await fatturaOda(93, 122, `<DatiOrdineAcquisto><IdDocumento>ODA-2026-0039</IdDocumento></DatiOrdineAcquisto>`);
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti where da_id = $1`, [id(93)])).rows[0].id;
    await persona();
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','ordine sbagliato')`, [c]);
    expect((await stato(93)).po).toBeNull();
    await db.query(`update fatture_ricevute set totale_documento = 122 where id = $1`, [id(93)]);
    expect((await stato(93)).po).toBeNull();
  });

  it("un utente del browser (ruolo authenticated) salva la fattura: i trigger non lo fermano", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await db.exec(`grant select, insert, update on fatture_ricevute to authenticated; grant usage on schema public to authenticated;`);
    await db.exec(`set role authenticated`);
    try {
      await fatturaOda(95, 122);
    } finally {
      await db.exec(`reset role`);
    }
    expect(await stato(95)).toEqual({ po: null, traccia: [{ regola: "oda_importo_fornitore", esito: "proposta", stato: "proposto" }] });
  });

  it("due ordini dello stesso fornitore con lo stesso importo: niente, nemmeno una proposta", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await ordine(ODA2, "ODA-2026-0040", 122);
    await fatturaOda(94, 122);
    expect(await stato(94)).toEqual({ po: null, traccia: [] });
  });

  // ── Revisione finale del 15/11 (migrazione 20290404309000) ─────────────────────────────────────
  const blocco = (numero: string, data?: string) =>
    `<DatiOrdineAcquisto><IdDocumento>${numero}</IdDocumento>${data ? `<Data>${data}</Data>` : ""}</DatiOrdineAcquisto>`;

  it("il numero si legge dal suo blocco, non dall'ultimo IdDocumento del file; anche più ordini citati", async () => {
    const x = `<p:FatturaElettronica>${blocco("ODA-2026-0039")}${blocco("ODA-2026-0040")}<DatiContratto><IdDocumento>C-7</IdDocumento></DatiContratto><DatiFattureCollegate><IdDocumento>FT 12</IdDocumento></DatiFattureCollegate></p:FatturaElettronica>`;
    const r = await db.query<{ testo: string }>(`select testo from acquisti_ordini_citati($1)`, [x]);
    expect(r.rows.map((x) => x.testo)).toEqual(["ODA-2026-0039", "ODA-2026-0040"]);
    await ordine(ODA, "ODA-2026-0040", 122);
    await fatturaOda(96, 122, x);
    expect(await stato(96)).toEqual({ po: ODA, traccia: [{ regola: "oda_numero_importo_fornitore", esito: "automatico", stato: "collegato" }] });
  });

  it("cita un altro ordine e l'importo coincide con questo: conflitto, nessuna proposta", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await fatturaOda(97, 122, blocco("ODA-2026-0051"));
    expect(await stato(97)).toEqual({ po: null, traccia: [] });
  });

  it("numero senza anno: vale l'anno della data citata contro quello dell'ordine", async () => {
    await ordine(ODA, "39", 122);
    await db.query(`update purchase_orders set issue_date = '2025-03-01' where id = $1`, [ODA]);
    await fatturaOda(98, 122, blocco("39", "2026-03-04"));
    expect(await stato(98)).toEqual({ po: null, traccia: [] });
    await fatturaOda(99, 122, blocco("39", "2025-03-04"));
    expect((await stato(99)).po).toBe(ODA);
  });

  it("rifiutato resta rifiutato: cambiano gli importi, il trigger non lo riaggancia", async () => {
    await db.query(`update company_governance_settings set collegamento_automatico = false where company_id = $1`, [AZ]);
    await ordine(ODA, "ODA-2026-0039", 122);
    await fatturaOda(100, 122, blocco("ODA-2026-0039"));
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti where da_id = $1`, [id(100)])).rows[0].id;
    await persona();
    await db.query(`select acquisti_collegamento_cambia_stato($1,'rifiutato','non è quell''ordine')`, [c]);
    await servizio();
    await db.query(`update company_governance_settings set collegamento_automatico = true where company_id = $1`, [AZ]);
    await db.query(`update fatture_ricevute set totale_documento = 122.00 where id = $1`, [id(100)]);
    expect((await stato(100)).po).toBeNull();
  });

  it("fattura già contabilizzata e ordine col costo della merce arrivata: né da sola né col clic (costo doppio)", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await db.query(`insert into company_costs(id, company_id, purchase_order_id) values ($1,$2,$3)`, [id(110), AZ, ODA]);
    await db.query(`insert into company_costs(id, company_id) values ($1,$2)`, [id(111), AZ]);
    await db.query(`insert into fatture_ricevute(id, company_id, tipo_documento, cedente_piva, totale_documento, xml_raw, company_cost_id) values ($1,$2,'TD01','IT00743110157',122,$3,$4)`,
      [id(101), AZ, blocco("ODA-2026-0039"), id(111)]);
    expect((await stato(101)).po).toBeNull();
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti where da_id = $1`, [id(101)])).rows[0].id;
    await persona();
    await expect(db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [c])).rejects.toThrow(/costo due volte/);
  });

  it("chi gestisce solo gli acquisti non conferma un ordine: lo dice in chiaro", async () => {
    await ordine(ODA, "ODA-2026-0039", 122);
    await fatturaOda(102, 122);
    const c = (await db.query<{ id: string }>(`select id from acquisti_collegamenti where da_id = $1`, [id(102)])).rows[0].id;
    await persona();
    await db.exec(`select set_config('test.documenti','no',false)`);
    try {
      await expect(db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [c])).rejects.toThrow(/fatture, costi o fornitori/);
    } finally {
      await db.exec(`select set_config('test.documenti','',false)`);
    }
  });
});

describe("fattura → commessa: il costo segue il collegamento (migrazione 20290404306000)", () => {
  const COMM = id(60), COMM2 = id(61), COSTO = id(62);
  beforeEach(async () => {
    await db.exec(`truncate company_costs`);
    await db.query(`insert into orders(id, company_id) values ($1,$2),($3,$2)`, [COMM, AZ, COMM2]);
  });
  const fatturaCommessa = async (n: number, contabilizzata = true) => {
    await fattura(n, []);
    await db.query(`update fatture_ricevute set imponibile_totale = 100 where id = $1`, [id(n)]);
    if (contabilizzata) {
      await db.query(`insert into company_costs(id, company_id) values ($1,$2)`, [COSTO, AZ]);
      await db.query(`update fatture_ricevute set company_cost_id = $1 where id = $2`, [COSTO, id(n)]);
    }
  };
  const dallaCatena = (n: number, esito = "automatico", a = COMM) =>
    db.query<{ r: { esito: string; costo: string | null; motivo?: string } }>(
      `select acquisti_commessa_della_fattura($1,$2,'catena_documenti',$3,'catena: DDT 12 → ordine ODA-1') r`, [id(n), a, esito]);
  const costo = async () =>
    (await db.query<{ order_id: string | null; quote: number }>(`select order_id, jsonb_array_length(allocations) quote from company_costs`)).rows;
  const traccia = async (n: number) =>
    (await db.query<{ id: string; esito: string; stato: string }>(`select id, esito, stato from acquisti_collegamenti where da_id = $1 and a_tipo = 'commessa'`, [id(n)])).rows;
  const persona = () =>
    db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${AZ}',false)`);

  it("acceso, fattura contabilizzata col costo libero: collegata da sola, il costo va sulla commessa", async () => {
    await fatturaCommessa(100);
    expect((await dallaCatena(100)).rows[0].r).toMatchObject({ esito: "collegato", costo: "sulla_commessa" });
    expect(await costo()).toEqual([{ order_id: COMM, quote: 0 }]);
    expect((await traccia(100))[0]).toMatchObject({ esito: "automatico", stato: "collegato" });
  });

  it("acceso ma non contabilizzata: proposta; la conferma di una persona contabilizza e porta il costo", async () => {
    await fatturaCommessa(101, false);
    expect((await dallaCatena(101)).rows[0].r).toMatchObject({ esito: "proposto", costo: null });
    expect(await costo()).toEqual([]);
    await persona();
    await db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [(await traccia(101))[0].id]);
    expect(await costo()).toEqual([{ order_id: COMM, quote: 0 }]);
  });

  it("spento: proposta, il costo resta dov'è", async () => {
    await db.query(`update company_governance_settings set collegamento_automatico = false where company_id = $1`, [AZ]);
    await fatturaCommessa(102);
    expect((await dallaCatena(102)).rows[0].r.esito).toBe("proposto");
    expect(await costo()).toEqual([{ order_id: null, quote: 0 }]);
  });

  it("costo già su un'altra commessa: non si registra niente; dal popup la conferma lo dice", async () => {
    await fatturaCommessa(103);
    await db.query(`update company_costs set order_id = $1`, [COMM2]);
    expect((await dallaCatena(103)).rows[0].r).toMatchObject({ esito: "saltata", motivo: "il costo è già assegnato" });
    expect(await traccia(103)).toEqual([]);
    await db.query(`select acquisti_collegamento_registra($1,'fattura_ricevuta',$2,null,'commessa',$3,null,'codici_commessa','proposta')`, [AZ, id(103), COMM]);
    await persona();
    await expect(db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [(await traccia(103))[0].id])).rejects.toThrow(/già su un'altra commessa/);
    expect(await costo()).toEqual([{ order_id: COMM2, quote: 0 }]);
  });

  it("annullata dal popup: il costo torna libero, e la regola non lo rimette", async () => {
    await fatturaCommessa(104);
    await dallaCatena(104);
    await persona();
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','cantiere sbagliato')`, [(await traccia(104))[0].id]);
    expect(await costo()).toEqual([{ order_id: null, quote: 0 }]);
    await db.exec(`select set_config('test.role','service_role',false), set_config('test.user','',false)`);
    await dallaCatena(104);
    expect(await costo()).toEqual([{ order_id: null, quote: 0 }]);
    expect((await traccia(104))[0].stato).toBe("annullato");
  });

  it("una persona aveva tolto la commessa dalla fattura: si propone, non si rimette da solo", async () => {
    await fatturaCommessa(105);
    await db.query(`update fatture_ricevute set aggancio_oda_manuale = true where id = $1`, [id(105)]);
    expect((await dallaCatena(105)).rows[0].r.esito).toBe("proposto");
    expect(await costo()).toEqual([{ order_id: null, quote: 0 }]);
  });

  it("quota della riga: conferma porta 40 su 100 alla commessa, annullo la toglie", async () => {
    await fatturaCommessa(106);
    await db.query(`select acquisti_collegamento_registra($1,'fattura_ricevuta',$2,'2','commessa',$3,null,'riga_cantiere','proposta','[]'::jsonb,null,null,null,40)`, [AZ, id(106), COMM]);
    await persona();
    const c = (await traccia(106))[0].id;
    await db.query(`select acquisti_collegamento_cambia_stato($1,'collegato')`, [c]);
    expect(await costo()).toEqual([{ order_id: null, quote: 1 }]);
    await db.query(`select acquisti_collegamento_cambia_stato($1,'annullato','riga di un altro cantiere')`, [c]);
    expect(await costo()).toEqual([{ order_id: null, quote: 0 }]);
  });

  it("la porta della commessa trovata dalle regole è solo del servizio", async () => {
    await fatturaCommessa(107);
    await persona();
    await expect(dallaCatena(107)).rejects.toThrow(/servizio/);
  });
});

describe("lavoro da fare (migrazione 20290404307000)", () => {
  beforeAll(async () => {
    await db.exec(`alter table suppliers add column if not exists tipo text, add column if not exists is_active boolean default true;`);
    await db.exec(readFileSync("supabase/migrations/20290404307000_acquisti_da_fare.sql", "utf8"));
  });
  it("conta proposte, storici da ricontrollare, fornitori senza tipo e fatture senza fornitore; solo a chi può collegare", async () => {
    const COMM = id(70);
    await db.query(`insert into orders(id, company_id) values ($1,$2)`, [COMM, AZ]);
    await fattura(71, [], { fornitore: null });
    await db.query(`update fatture_ricevute set cedente_piva = 'IT00743110157' where id = $1`, [id(71)]);
    await fattura(72, [], { fornitore: null });
    await db.query(`select acquisti_collegamento_registra($1,'fattura_ricevuta',$2,null,'commessa',$3,null,'codici_commessa','proposta')`, [AZ, id(71), COMM]);
    await db.query(`insert into suppliers(company_id, vat_number, tipo) values ($1,'01234567897',null),($1,'03456789019','generali')`, [AZ]);
    const r = (await db.query<{ r: Record<string, number> }>(`select acquisti_da_fare($1) r`, [AZ])).rows[0].r;
    expect(r).toEqual({ proposte: 1, da_ricontrollare: 0, fornitori_senza_tipo: 1, fatture_senza_fornitore: 2, fatture_senza_identificativo: 1 });
    await db.exec(`select set_config('test.role','authenticated',false), set_config('test.user','${UTENTE}',false), set_config('test.company','${ALTRA}',false)`);
    await expect(db.query(`select acquisti_da_fare($1)`, [AZ])).rejects.toThrow(/permesso/);
  });
});
