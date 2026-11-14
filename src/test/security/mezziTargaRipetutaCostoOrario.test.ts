/**
 * Fase 5 (14/11/2026), mezzi: la targa si cerca anche quando nasce il mezzo e quando cambiano le righe
 * della fattura, senza raddoppiare; una fattura ripartita su commesse non entra nel costo orario.
 * Le funzioni vere delle migrazioni, su un Postgres in memoria (PGlite). Nessuna AI coinvolta.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const pg = new PGlite();
const az = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const m1 = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const m2 = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const f1 = "11111111-1111-4111-8111-111111111111";
const f2 = "22222222-2222-4222-8222-222222222222";
const commessa = "99999999-9999-4999-8999-999999999999";

const leggi = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");
const pezzo = (testo: string, da: string, a: string) => {
  const i = testo.indexOf(da);
  if (i < 0) throw new Error(`manca ${da}`);
  return testo.slice(i, testo.indexOf(a, i));
};

beforeAll(async () => {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table companies(id uuid primary key);
    create table mezzi(id uuid primary key, company_id uuid, targa text, matricola text, deleted_at timestamptz, rata_mensile numeric, possesso text);
    create table company_costs(id uuid primary key, order_id uuid, allocations jsonb);
    create table fatture_ricevute(id uuid primary key, company_id uuid, tipo_documento text default 'TD01', righe jsonb, imponibile_totale numeric,
      xml_raw text, fornitore_id uuid, company_cost_id uuid, cedente_ragione_sociale text default 'Officina', data_fattura date default current_date, stato text default 'letta');
    create table ddt_ricezione(id uuid, company_id uuid, numero_ddt text, supplier_id uuid);
    create table fattura_ddt(id uuid default gen_random_uuid(), company_id uuid, fattura_ricevuta_id uuid, numero_ddt text, data_ddt date, origine text, created_by uuid, ddt_ricezione_id uuid);
    create table fattura_ricevuta_mezzi(id uuid primary key default gen_random_uuid(), company_id uuid, fattura_ricevuta_id uuid, mezzo_id uuid, importo numeric,
      origine text, confermata boolean not null default false, created_by uuid, unique (fattura_ricevuta_id, mezzo_id));
    create table mezzi_documenti(mezzo_id uuid, company_id uuid, categoria text, titolo text, importo numeric, data_scadenza date, created_at timestamptz);
    create table mezzi_manutenzioni(mezzo_id uuid, company_id uuid, costo numeric, data date);
    create table rapportino_mezzi_costi(mezzo_id uuid, company_id uuid, ore numeric, data_lavoro date);
    create function e_nota_credito_ricevuta(text) returns boolean language sql immutable as $$ select $1 = 'TD04' $$;
    create function e_autofattura_ricevuta(text) returns boolean language sql immutable as $$ select false $$;
    create function e_super_admin_dentro(uuid) returns boolean language sql as $$ select true $$;
    create function aziende_con_permesso(text) returns uuid[] language sql as $$ select array[]::uuid[] $$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$ select false $$;
    create function mezzo_spesa_tipo(text) returns text language sql immutable as $$ select 'manutenzione'::text $$;
    insert into companies values ('${az}');
  `);
  const importo = leggi("20281126100000_mezzi_importo_targa_su_riga_senza_prezzo.sql");
  await pg.exec(pezzo(importo, "create or replace function public.importo_legame_mezzo", "revoke all on function public.importo_legame_mezzo"));
  await pg.exec(pezzo(importo, "create or replace function public.fattura_collega_ddt_e_mezzi", "create or replace function public.mezzo_cerca_nelle_fatture"));
  const base = leggi("20281123100000_fattura_mezzi_e_ddt.sql");
  await pg.exec(pezzo(base, "create or replace function public.fattura_ricevuta_collegamenti_auto", "-- Dalla scheda del mezzo"));
  const costo = leggi("20290116240000_mezzi_costo_orario_e_quota_commessa.sql");
  const i = costo.indexOf("create or replace function public.mezzi_spese_12_mesi");
  await pg.exec(costo.slice(i, costo.indexOf("revoke all on function public.mezzi_spese_12_mesi", i)));
  await pg.exec(leggi("20290317111500_mezzi_costi_solo_associazioni_confermate.sql"));
  await pg.exec(leggi("20290317114500_mezzi_costi_coperture_distinte.sql"));
  // La migrazione nuova due volte: dev'essere idempotente.
  await pg.exec(leggi("20290320150000_mezzi_targa_ripetuta_e_costo_orario_senza_ripartite.sql"));
  await pg.exec(leggi("20290320150000_mezzi_targa_ripetuta_e_costo_orario_senza_ripartite.sql"));
});
afterAll(() => pg.close());

const legami = async () => (await pg.query<{ fattura_ricevuta_id: string; mezzo_id: string; importo: string | null; confermata: boolean }>(
  "select fattura_ricevuta_id, mezzo_id, importo::text, confermata from fattura_ricevuta_mezzi order by fattura_ricevuta_id, mezzo_id")).rows;

it("fattura con la targa di un solo mezzo: collegata all'arrivo, con l'imponibile, da confermare", async () => {
  await pg.exec(`insert into mezzi values ('${m1}', '${az}', 'AB 123 CD', null, null, null, 'proprieta');
    insert into fatture_ricevute (id, company_id, righe, imponibile_totale) values
      ('${f1}', '${az}', '[{"descrizione":"Tagliando furgone targa AB123CD","imponibile":"0"},{"descrizione":"Olio","imponibile":"180.50"}]', 180.50);`);
  expect(await legami()).toEqual([{ fattura_ricevuta_id: f1, mezzo_id: m1, importo: "180.50", confermata: false }]);
});

it("un mezzo che nasce dopo trova da solo le fatture con la sua targa", async () => {
  await pg.exec(`insert into fatture_ricevute (id, company_id, righe, imponibile_totale) values
      ('${f2}', '${az}', '[{"descrizione":"Gomme escavatore matricola XK900123","imponibile":"640"}]', 640);`);
  expect((await legami()).filter((l) => l.fattura_ricevuta_id === f2)).toEqual([]);
  await pg.exec(`insert into mezzi values ('${m2}', '${az}', null, 'XK900123', null, null, 'proprieta');`);
  expect((await legami()).filter((l) => l.fattura_ricevuta_id === f2)).toEqual([{ fattura_ricevuta_id: f2, mezzo_id: m2, importo: "640", confermata: false }]);
});

it("righe cambiate o ricerca ripetuta: nessun legame doppio, la conferma resta", async () => {
  await pg.exec(`update fattura_ricevuta_mezzi set confermata = true where fattura_ricevuta_id = '${f1}';
    update fatture_ricevute set righe = righe || '[{"descrizione":"Lavaggio AB123CD","imponibile":"20"}]'::jsonb where id = '${f1}';
    update mezzi set targa = 'AB123CD' where id = '${m1}';`);
  expect((await pg.query("select mezzo_cerca_nelle_fatture($1) as n", [m1])).rows[0]).toEqual({ n: 0 });
  const l = await legami();
  expect(l).toHaveLength(2);
  expect(l.find((x) => x.fattura_ricevuta_id === f1)?.confermata).toBe(true);
});

it("un mezzo cancellato non cerca, e uno senza targa valida non blocca il salvataggio", async () => {
  await pg.exec(`insert into mezzi values (gen_random_uuid(), '${az}', 'X1', null, null, null, 'proprieta');`);
  await pg.exec(`insert into mezzi values (gen_random_uuid(), '${az}', 'AB123CD', null, now(), null, 'proprieta');`);
  expect(await legami()).toHaveLength(2);
});

it("una fattura del mezzo ripartita su commesse non entra anche nel costo orario", async () => {
  const totale = async () => Number((await pg.query<{ totale: string }>("select totale from mezzi_spese_12_mesi($1, $2)", [az, m2])).rows[0].totale);
  await pg.exec(`update fattura_ricevuta_mezzi set confermata = true where fattura_ricevuta_id = '${f2}';`);
  expect(await totale()).toBe(640);
  await pg.exec(`insert into company_costs values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null, '[{"order_id":"${commessa}","pct":60},{"order_id":"${commessa.replace("9999-4", "8888-4")}","pct":40}]');
    update fatture_ricevute set company_cost_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' where id = '${f2}';`);
  expect(await totale()).toBe(0);
  // Un costo senza commessa né ripartizione resta del mezzo.
  await pg.exec(`update company_costs set allocations = '[]' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'`);
  expect(await totale()).toBe(640);
});
