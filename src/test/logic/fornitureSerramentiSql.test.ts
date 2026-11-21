/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const azienda = "40000000-0000-4000-a000-000000000001";
const progetto = "40000000-0000-4000-a000-000000000002";
const ordine = "40000000-0000-4000-a000-000000000003";
const fornitoreA = "40000000-0000-4000-a000-000000000010";
const fornitoreB = "40000000-0000-4000-a000-000000000020";
const odaA = "40000000-0000-4000-a000-000000000011";
const odaB = "40000000-0000-4000-a000-000000000021";
const funzione = "converti_modulo_commessa_atomic";
let db: PGlite;

function corpoFunzione(sql: string, nome: string): string {
  const inizio = sql.indexOf(`create or replace function public.${nome}(`);
  const fine = sql.indexOf("$function$;", inizio);
  return sql.slice(inizio, fine + "$function$;".length);
}

beforeAll(async () => {
  db = new PGlite();
  const base = readFileSync("supabase/migrations/20281231220000_contratti_dei_preventivatori.sql", "utf8");
  const inizio = base.indexOf("    for r in select value from jsonb_array_elements(serramenti) loop");
  const fine = base.indexOf("    -- I servizi", inizio);
  // Estrae i due rami reali della conversione. Il contesto di prova sostituisce la
  // testata del contratto e l'anagrafica cliente, esterne alla proiezione dei materiali.
  const proiezione = base.slice(inizio, fine).replaceAll("'da_rilevare'", "'confermato'");
  await db.exec(`
    create role anon;
    create role authenticated;
    create table listini_fornitore(id uuid primary key default gen_random_uuid(), company_id uuid,
      supplier_id uuid, attivo boolean default true);
    create table listino_fornitore_voci(id uuid primary key, company_id uuid, listino_id uuid,
      codice text, descrizione text, unita text, prezzo numeric, sconto_pct numeric, immagine_url text, sort_order integer);
    create table sr_serramenti_progetto(id uuid primary key default gen_random_uuid());
    create table suppliers(id uuid primary key, company_id uuid, is_active boolean);
    create table article_families(id uuid primary key);
    create table order_items(id uuid primary key default gen_random_uuid(), name text, order_id uuid,
      supplier_id uuid, product_code text, measure_status text, misure_preventivo jsonb, misure_da_ordinare jsonb,
      prezzo_fonte text, specifiche text, riferimento text, axis_selections jsonb, description text, gruppo_id uuid,
      misura_tipo text, misura_forma text, misure_rilevate jsonb);
    create table purchase_orders(id uuid primary key, order_id uuid, company_id uuid, supplier_id uuid,
      status text default 'bozza', ordina_comunque_righe uuid[]);
    create table purchase_order_items(id uuid primary key default gen_random_uuid(), company_id uuid,
      purchase_order_id uuid, order_item_id uuid, sku text, description text, unit_price numeric, vat_rate numeric,
      riferimento text, misure jsonb, misure_fonte text, misura_tipo text, colore text, apertura text, misure_testo text,
      riordino_motivo text);
    create function ${funzione}(p_chiave text, p_progetto uuid, p_raggruppa boolean, p_anteprima boolean, p_finto text, p_ids uuid[])
    returns jsonb language plpgsql as $test$
    declare
      r jsonb; serramenti jsonb := p_finto::jsonb; accessori jsonb := '[]'; materiali jsonb := '[]';
      esclusi integer := 0; quantita numeric; misure text; prezzo numeric; nome text;
      aliquota numeric := 10; gruppi_misura jsonb := '{}'; chiave_gruppo text;
      azienda uuid := '${azienda}';
    begin
    ${proiezione}
      return materiali;
    end
    $test$;
    insert into suppliers values ('${fornitoreA}', '${azienda}', true), ('${fornitoreB}', '${azienda}', true);
    insert into purchase_orders (id, order_id, company_id, supplier_id) values ('${odaA}','${ordine}','${azienda}','${fornitoreA}'),
      ('${odaB}','${ordine}','${azienda}','${fornitoreB}');
  `);
  const misureOda = readFileSync("supabase/migrations/20290103100000_offerta_ordine_su_misura.sql", "utf8");
  const misureAggiornate = readFileSync("supabase/migrations/20290103100200_misure_leggi_nome_proprio.sql", "utf8");
  await db.exec([
    corpoFunzione(misureOda, "misura_num"),
    corpoFunzione(misureAggiornate, "misure_leggi"),
    corpoFunzione(misureOda, "misure_testo_breve"),
    corpoFunzione(misureAggiornate, "riga_misure_ordine"),
    corpoFunzione(misureOda, "purchase_order_items_copia_misure"),
    "create trigger purchase_order_items_copia_misure before insert on purchase_order_items for each row execute function purchase_order_items_copia_misure();",
  ].join("\n"));
  const migrazione = readFileSync("supabase/migrations/20290430151000_serramenti_listino_fornitori.sql", "utf8");
  await db.exec(migrazione);
  await db.exec(migrazione);
}, 60_000);

afterAll(async () => { await db?.close(); });

function proietta(righe: unknown[]) {
  return db.query<{ materiali: Array<Record<string, unknown>> }>(
    `select ${funzione}('sr', $1::uuid, false, true, $2, null) as materiali`,
    [progetto, JSON.stringify(righe)],
  );
}

it("proietta fornitore, codice, tre misure e prezzo netto nel motore della commessa e li ritrova negli OdA", async () => {
  const misure = [
    { L: 1000, H: 1400, venditaA: 728, costoA: 490, venditaB: 810, costoB: 540 },
    { L: 1200, H: 1500, venditaA: 936, costoA: 630, venditaB: 1010, costoB: 690 },
    { L: 1400, H: 1600, venditaA: 1164.8, costoA: 784, venditaB: 1240, costoB: 850 },
  ];
  const righe = misure.flatMap(({ L, H, venditaA, costoA, venditaB, costoB }) => [
    { fornitore: fornitoreA, serie: "Profilo A 76", codice: "A-2A", note: "PVC 76 mm, doppio vetro", vendita: venditaA, costo: costoA, L, H },
    { fornitore: fornitoreB, serie: "Profilo B 82", codice: `B-2A-${L}`, note: "PVC 82 mm, triplo vetro", vendita: venditaB, costo: costoB, L, H },
  ]);
  const { rows } = await proietta(righe.map((r) => ({
    tipologia_label: "Finestra a 2 ante", ambiente: "Soggiorno", quantita: 1,
    larghezza_mm: r.L, altezza_mm: r.H, prezzo_unitario: r.vendita,
    disegno_config: { v: 1, tipologia: "finestra_2_ante" },
    fornitura_listino: {
      v: 1, supplier_id: r.fornitore, codice: r.codice, serie: r.serie, specifiche: r.note,
      larghezza_mm: r.L, altezza_mm: r.H, acquisto_unitario: r.costo, iva_acquisto: 22,
    },
  })));
  const materiali = rows[0].materiali;
  expect(materiali).toHaveLength(6);
  for (const [i, r] of righe.entries()) {
    const m = materiali[i];
    expect(m).toMatchObject({ name: "Finestra a 2 ante", supplier_id: r.fornitore, product_code: r.codice,
      unit_price: r.vendita, purchase_price: r.costo, vat_rate: 10, specifiche: r.serie + " · " + r.note });
    const { rows: articoli } = await db.query<{ id: string }>(`
      insert into order_items (name, order_id, supplier_id, product_code, measure_status, misure_preventivo,
        misure_da_ordinare, prezzo_fonte, specifiche, riferimento, axis_selections)
      values ($1,$2,$3,$4,$5,$6,jsonb_build_object('larghezza_mm',$11::numeric,'altezza_mm',$12::numeric),$7,$8,$9,$10) returning id
    `, [m.name, ordine, m.supplier_id, m.product_code, m.measure_status, JSON.stringify(m.misure_preventivo),
      m.prezzo_fonte, m.specifiche, m.riferimento, JSON.stringify(m.axis_selections), r.L, r.H]);
    const { rows: acquisti } = await db.query(`
      insert into purchase_order_items (company_id, purchase_order_id, order_item_id, description, unit_price)
      values ($1,$2,$3,$4,$5) returning sku, misure_testo, unit_price, vat_rate
    `, [azienda, r.fornitore === fornitoreA ? odaA : odaB, articoli[0].id, m.name, r.costo]);
    expect(acquisti[0]).toMatchObject({
      sku: r.codice,
      misure_testo: expect.stringContaining(`L ${r.L} × H ${r.H} mm`),
      unit_price: String(r.costo), vat_rate: "22",
    });
    expect(acquisti[0]).toMatchObject({ misure_testo: expect.stringContaining(r.serie + " · " + r.note) });
    if (i === 0) {
      await expect(db.query(`
        insert into purchase_order_items (company_id, purchase_order_id, order_item_id, description)
        values ($1,$2,$3,'Altro fornitore')
      `, [azienda, odaB, articoli[0].id])).rejects.toThrow(/fornitore dell/);
      await db.query("update order_items set misure_da_ordinare = jsonb_build_object('larghezza_mm',1001,'altezza_mm',1400) where id = $1", [articoli[0].id]);
      await expect(db.query(`
        insert into purchase_order_items (company_id, purchase_order_id, order_item_id, description)
        values ($1,$2,$3,'Misure cambiate')
      `, [azienda, odaA, articoli[0].id])).rejects.toThrow(/misure sono cambiate/);
      await db.query(`update order_items set product_code = 'A-2A-REV', prezzo_fonte = 'manuale',
        axis_selections = axis_selections || '{"_misure_listino_verificate":"1001×1400"}'::jsonb where id = $1`, [articoli[0].id]);
      const nuova = await db.query(`
        insert into purchase_order_items (company_id, purchase_order_id, order_item_id, description, unit_price)
        values ($1,$2,$3,'Misure verificate',505) returning sku, misure_testo, unit_price
      `, [azienda, odaA, articoli[0].id]);
      expect(nuova.rows[0]).toMatchObject({
        sku: "A-2A-REV", misure_testo: expect.stringContaining("L 1001 × H 1400 mm"), unit_price: "505",
      });
    }
  }
});

it("una posizione storica senza listino mantiene prezzo, misure e IVA del preventivo", async () => {
  const { rows } = await proietta([{ tipologia_label: "Storico", larghezza_mm: 1200, altezza_mm: 1400, prezzo_unitario: 800 }]);
  expect(rows[0].materiali[0]).toMatchObject({ name: "Storico", unit_price: 800, vat_rate: 10 });
  expect(rows[0].materiali[0]).not.toHaveProperty("purchase_price");
});

it("salva la configurazione nel listino con controllo revisione e la conserva per i client precedenti", async () => {
  await db.exec(`
    create schema private;
    create schema auth;
    create type app_role as enum ('super_admin');
    create function auth.uid() returns uuid language sql as $$ select '${progetto}'::uuid $$;
    create function utente_bloccato() returns boolean language sql as $$ select false $$;
    create function utente_e_cliente_esterno() returns boolean language sql as $$ select false $$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$ select false $$;
    create function get_my_company_id() returns uuid language sql as $$ select '${azienda}'::uuid $$;
    create function aziende_con_uno_dei_permessi(text[]) returns uuid[] language sql as $$ select array['${azienda}'::uuid] $$;
    create function has_role(uuid, app_role) returns boolean language sql as $$ select false $$;
  `);
  await db.exec(readFileSync("supabase/migrations/20290430150001_listino_fornitore_salvataggio_atomico.sql", "utf8"));
  const migrazione = readFileSync("supabase/migrations/20290504100800_listino_fornitore_configurazione_atomica.sql", "utf8");
  await db.exec(migrazione);
  await db.exec(migrazione);
  const riga = { id: "40000000-0000-4000-a000-000000000031", codice: "QA-A", descrizione: "Finestra", unita: "pz",
    prezzo: 100, sconto_pct: 0, sort_order: 0 };
  const configurazione = { tipologia: "finestra_2_ante", serie: "Profilo A", specifiche: "Doppio vetro", vendita: 150, iva_acquisto: 22 };
  const salva = async (testata: { id: string; revisione: number } | null, voci: unknown[]) =>
    (await db.query<{ dati: { id: string; revisione: number } }>(
      "select salva_voci_listino_fornitore($1,$2,$3,$4,$5) as dati",
      [azienda, fornitoreA, testata?.id ?? null, testata?.revisione ?? null, JSON.stringify(voci)],
    )).rows[0].dati;
  const leggi = async (listino: string) => (await db.query<{ dati: { voci: unknown[] } }>(
    "select leggi_voci_listino_fornitore($1,$2,$3) as dati", [listino, fornitoreA, azienda],
  )).rows[0].dati.voci;
  const creato = await salva(null, [{ ...riga, configurazione_serramento: configurazione }]);
  expect(await leggi(creato.id)).toMatchObject([{ codice: riga.codice, configurazione_serramento: configurazione }]);
  const aggiornato = await salva(creato, [{ ...riga, prezzo: 101 }]);
  expect(await leggi(creato.id)).toMatchObject([{ prezzo: 101, configurazione_serramento: configurazione }]);
  await expect(salva(creato, [{ ...riga, configurazione_serramento: null }])).rejects.toThrow(/listino è cambiato/);
  await salva(aggiornato, [{ ...riga, configurazione_serramento: null }]);
  expect(await leggi(creato.id)).toMatchObject([{ configurazione_serramento: null }]);
});
