/**
 * Fase 5 (14/11/2026): la commessa di una fattura ricevuta si riconosce da CUP, CIG o codice commessa,
 * senza AI. La migrazione vera su un Postgres in memoria (PGlite).
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const pg = new PGlite();
const az = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const altra = "abababab-abab-4bab-8bab-abababababab";
const villa = "11111111-1111-4111-8111-111111111111";
const cagliari1 = "22222222-2222-4222-8222-222222222222";
const cagliari2 = "33333333-3333-4333-8333-333333333333";
const estranea = "44444444-4444-4444-8444-444444444444";

const xml = (corpo: string) => `<p:FatturaElettronica><FatturaElettronicaBody>${corpo}</FatturaElettronicaBody></p:FatturaElettronica>`;
let n = 0;
async function arriva(opts: { xml?: string; righe?: unknown[]; azienda?: string; costo?: string }): Promise<{ order_id_suggerito: string | null; order_suggerito_motivo: string | null; id: string }> {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  await pg.query("insert into fatture_ricevute (id, company_id, xml_raw, righe, company_cost_id) values ($1, $2, $3, $4, $5)",
    [id, opts.azienda ?? az, opts.xml ?? null, JSON.stringify(opts.righe ?? []), opts.costo ?? null]);
  return (await pg.query<{ order_id_suggerito: string | null; order_suggerito_motivo: string | null; id: string }>(
    "select id, order_id_suggerito, order_suggerito_motivo from fatture_ricevute where id = $1", [id])).rows[0];
}

beforeAll(async () => {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create table companies(id uuid primary key);
    create table orders(id uuid primary key, company_id uuid, order_code text, riferimento_committente text, deleted_at timestamptz);
    create table generale_contratti(generale_id uuid, company_id uuid, cup text, cig text);
    create table documenti_fiscali(company_id uuid, ordine_id uuid, deleted_at timestamptz, cup text, cig text);
    create table company_costs(id uuid primary key, order_id uuid, allocations jsonb);
    create table fatture_ricevute(id uuid primary key, company_id uuid, xml_raw text, righe jsonb, company_cost_id uuid, stato text default 'letta',
      data_fattura date default current_date, order_id_suggerito uuid, order_match_confidenza numeric);
    create function e_super_admin_dentro(uuid) returns boolean language sql as $$ select true $$;
    create function aziende_con_permesso(text) returns uuid[] language sql as $$ select array[]::uuid[] $$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$ select false $$;
    insert into companies values ('${az}'), ('${altra}');
    insert into orders values ('${villa}', '${az}', 'O-0083', '06/2025', null), ('${cagliari1}', '${az}', '26000001', null, null),
      ('${cagliari2}', '${az}', '26000002', null, null), ('${estranea}', '${altra}', 'O-0083', null, null);
    insert into generale_contratti values ('${cagliari1}', '${az}', 'H85E12000710002', 'B07C035D03');
  `);
  const m = readFileSync("supabase/migrations/20290320150200_commessa_da_cup_cig_codice.sql", "utf8");
  await pg.exec(m);
  await pg.exec(m);
});
afterAll(() => pg.close());

it("CUP nell'XML: riconosciuta dal contratto della commessa, senza AI", async () => {
  const f = await arriva({ xml: xml("<DatiContratto><IdDocumento>Rep. 12</IdDocumento><CodiceCUP>H85E12000710002</CodiceCUP></DatiContratto>") });
  expect(f).toMatchObject({ order_id_suggerito: cagliari1, order_suggerito_motivo: "CUP H85E12000710002" });
});

it("codice commessa scritto nella riga: riconosciuta", async () => {
  const f = await arriva({ righe: [{ descrizione: "Fornitura cls cantiere commessa O-0083 Villa Ida" }] });
  expect(f).toMatchObject({ order_id_suggerito: villa, order_suggerito_motivo: "codice commessa O-0083" });
});

it("riferimento del committente solo nei tag, non nelle righe (06/2025 è anche una data)", async () => {
  expect((await arriva({ xml: xml("<Causale>SAL 3 lavori rif. 06/2025</Causale>") })).order_id_suggerito).toBe(villa);
  expect((await arriva({ righe: [{ descrizione: "Consegna del 12/06/2025" }] })).order_id_suggerito).toBeNull();
});

it("impara dalle fatture già messe su una commessa: stesso CUP, altro fornitore", async () => {
  await pg.exec(`insert into company_costs values ('55555555-5555-4555-8555-555555555555', null, '[{"order_id":"${cagliari2}","pct":100}]')`);
  await arriva({ xml: xml("<CodiceCUP>D13D21000450001</CodiceCUP>"), costo: "55555555-5555-4555-8555-555555555555" });
  const f = await arriva({ xml: xml("<CodiceCUP>D13D21000450001</CodiceCUP>") });
  expect(f).toMatchObject({ order_id_suggerito: cagliari2, order_suggerito_motivo: "CUP D13D21000450001" });
});

it("due commesse possibili: nessuna proposta; un'altra azienda non conta", async () => {
  await pg.exec(`insert into generale_contratti values ('${cagliari2}', '${az}', null, 'B07C035D03')`);
  expect((await arriva({ xml: xml("<CodiceCIG>B07C035D03</CodiceCIG>") })).order_id_suggerito).toBeNull();
  expect((await arriva({ azienda: altra, righe: [{ descrizione: "commessa O-0083" }] })).order_id_suggerito).toBe(estranea);
  expect((await arriva({ righe: [{ descrizione: "niente codici qui" }] })).order_id_suggerito).toBeNull();
});

it("una proposta già presente non si sovrascrive, e le vecchie si propongono a richiesta senza doppioni", async () => {
  await pg.exec(`alter table fatture_ricevute disable trigger trg_fattura_ricevuta_commessa_da_codici`);
  const vecchia = await arriva({ righe: [{ descrizione: "Noleggio gru commessa O-0083" }] });
  expect(vecchia.order_id_suggerito).toBeNull();
  await pg.exec(`alter table fatture_ricevute enable trigger trg_fattura_ricevuta_commessa_da_codici`);
  const prima = Number((await pg.query<{ n: number }>("select fatture_proponi_commessa_da_codici($1) as n", [az])).rows[0].n);
  expect(prima).toBeGreaterThanOrEqual(1);
  expect((await pg.query("select order_id_suggerito, order_suggerito_motivo from fatture_ricevute where id = $1", [vecchia.id])).rows[0])
    .toEqual({ order_id_suggerito: villa, order_suggerito_motivo: "codice commessa O-0083" });
  expect((await pg.query<{ n: number }>("select fatture_proponi_commessa_da_codici($1) as n", [az])).rows[0].n).toBe(0);
});
