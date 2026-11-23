/**
 * 23/11/2026 — i totali dello Scadenzario in una chiamata sola.
 *
 * `scadenzario_totali` deve dire ESATTAMENTE quello che dicevano le tre
 * chiamate di prima: il riepilogo di `scadenzario_riepilogo_fonti` (le stesse
 * formule, copiate) e i dodici mesi che il grafico calcolava nel browser dopo
 * aver scaricato tutte le righe dell'anno.
 *
 * Qui `scadenzario_fonti` è finta, con righe decise a mano: quello che si
 * controlla è l'aritmetica dei totali, non da dove escono le righe (per quello
 * c'è scadenzarioFontiDatabase).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const riepilogoSql = readFileSync("supabase/migrations/20290421110000_scadenzario_fonti_commesse_costi.sql", "utf8")
  .match(/create or replace function public\.scadenzario_riepilogo_fonti[\s\S]*?\$function\$;/i)![0];
const totaliSql = readFileSync("supabase/migrations/20290525100000_scadenzario_totali_una_chiamata.sql", "utf8");

const a = "a0000000-0000-4000-a000-000000000001";
const anno = 2026;
let db: PGlite;

/** Le righe: due a gennaio, una a marzo, una senza data, una annullata (da ignorare). */
const righe = [
  { id: "11111111-0000-4000-a000-000000000001", direction: "entrata", amount: 1000, paid: 250, due: `${anno}-01-10`, status: "parziale" },
  { id: "11111111-0000-4000-a000-000000000002", direction: "uscita", amount: 400, paid: 0, due: `${anno}-01-20`, status: "da_pagare" },
  { id: "11111111-0000-4000-a000-000000000003", direction: "entrata", amount: 300, paid: 300, due: `${anno}-03-05`, status: "pagata" },
  { id: "11111111-0000-4000-a000-000000000004", direction: "uscita", amount: 90, paid: 0, due: null, status: "da_pagare" },
  { id: "11111111-0000-4000-a000-000000000005", direction: "uscita", amount: 7000, paid: 0, due: `${anno}-02-01`, status: "annullata" },
  // L'anno prima: non deve entrare nei dodici mesi.
  { id: "11111111-0000-4000-a000-000000000006", direction: "entrata", amount: 5000, paid: 0, due: `${anno - 1}-01-15`, status: "da_pagare" },
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table scadenze(id uuid primary key, company_id uuid, tipo text, direction text, description text,
      amount numeric, due_date date, status text, paid_amount numeric, paid_date date, payment_method text,
      cost_id uuid, order_id uuid, supplier_id uuid, invoice_id uuid, notes text, is_auto_generated boolean,
      auto_source text, created_at timestamptz, updated_at timestamptz);
    create function public.scadenzario_fonti(p_company_id uuid) returns setof scadenze
      language sql stable as $$ select * from scadenze where company_id = p_company_id $$;
  `);
  await db.exec(`insert into scadenze(id, company_id, direction, amount, paid_amount, due_date, status) values ${
    righe.map(r => `('${r.id}','${a}','${r.direction}',${r.amount},${r.paid},${r.due ? `'${r.due}'` : "null"},'${r.status}')`).join(",")
  };`);
  await db.exec(riepilogoSql);
  await db.exec(totaliSql);
}, 20000);
afterAll(async () => { await db?.close(); });

const totali = async (args: string) =>
  (await db.query<{ t: { riepilogo: Record<string, number>; mesi: { entrate: number; uscite: number }[] | null } }>(
    `select public.scadenzario_totali(${args}) t`)).rows[0].t;

const riepilogoVecchio = async (args: string) =>
  (await db.query<{ r: Record<string, number> }>(`select public.scadenzario_riepilogo_fonti(${args}) r`)).rows[0].r;

describe("scadenzario_totali", () => {
  it("dà lo stesso riepilogo della funzione di prima, senza filtri", async () => {
    const nuovo = await totali(`'${a}', null, null, true, false, ${anno}`);
    expect(nuovo.riepilogo).toEqual(await riepilogoVecchio(`'${a}', null, null, true, false`));
  });

  it("dà lo stesso riepilogo anche coi filtri di data e senza le righe senza data", async () => {
    const args = `'${a}', '${anno}-01-01'::date, '${anno}-01-31'::date, false, false`;
    const nuovo = await totali(`${args}, ${anno}`);
    expect(nuovo.riepilogo).toEqual(await riepilogoVecchio(args));
    // Controllo di merito: a gennaio restano le due righe, 750 da incassare e 400 da pagare.
    expect(nuovo.riepilogo.tutte_count).toBe(2);
    expect(Number(nuovo.riepilogo.entrate_previste)).toBe(750);
    expect(Number(nuovo.riepilogo.uscite_previste)).toBe(400);
  });

  it("e con «solo senza data»", async () => {
    const args = `'${a}', null, null, true, true`;
    expect((await totali(`${args}, ${anno}`)).riepilogo).toEqual(await riepilogoVecchio(args));
  });

  it("i dodici mesi sono dodici, con gli importi pieni divisi fra entrate e uscite", async () => {
    const { mesi } = await totali(`'${a}', null, null, true, false, ${anno}`);
    expect(mesi).toHaveLength(12);
    expect(mesi![0]).toEqual({ entrate: 1000, uscite: 400 });   // gennaio: importo pieno, non il residuo
    expect(mesi![1]).toEqual({ entrate: 0, uscite: 0 });        // febbraio: solo l'annullata, che non conta
    expect(mesi![2]).toEqual({ entrate: 300, uscite: 0 });      // marzo
    expect(mesi!.slice(3).every(m => m.entrate === 0 && m.uscite === 0)).toBe(true);
  });

  it("i mesi non guardano i filtri di data della pagina: l'anno è intero", async () => {
    const stretto = await totali(`'${a}', '${anno}-01-01'::date, '${anno}-01-31'::date, false, false, ${anno}`);
    expect(stretto.mesi![2]).toEqual({ entrate: 300, uscite: 0 });
  });

  it("l'anno prima resta fuori", async () => {
    const prima = await totali(`'${a}', null, null, true, false, ${anno - 1}`);
    expect(prima.mesi![0]).toEqual({ entrate: 5000, uscite: 0 });
    expect(prima.mesi![1]).toEqual({ entrate: 0, uscite: 0 });
  });

  it("senza anno non calcola i mesi: il grafico non c'è", async () => {
    expect((await totali(`'${a}', null, null, true, false, null`)).mesi).toBeNull();
  });

  it("è chiusa a chi non ha fatto l'accesso", async () => {
    const r = await db.query<{ anon: boolean; autenticato: boolean }>(`
      select has_function_privilege('anon', oid, 'EXECUTE') anon,
             has_function_privilege('authenticated', oid, 'EXECUTE') autenticato
        from pg_proc where proname = 'scadenzario_totali'`);
    expect(r.rows[0]).toEqual({ anon: false, autenticato: true });
  });
});
