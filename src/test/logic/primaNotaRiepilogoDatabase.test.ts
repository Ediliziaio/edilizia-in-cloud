import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const db = new PGlite();
const azienda = "00000000-0000-4000-8000-000000000001";
const altraAzienda = "00000000-0000-4000-8000-000000000002";
const banca = "00000000-0000-4000-8000-000000000003";
const liquidita = "00000000-0000-4000-8000-000000000004";

beforeAll(async () => {
  await db.exec(`
    create role authenticated;
    create role anon;
    create table public.prima_nota_entries (
      company_id uuid, entry_date date, direction text, category text, description text,
      amount numeric(12,2), is_auto boolean, auto_source text,
      bank_account_id uuid, conto_liquidita_id uuid, account_label text
    );
    alter table public.prima_nota_entries enable row level security;
    grant select on public.prima_nota_entries to authenticated;
    create policy lettura on public.prima_nota_entries for select to authenticated
      using (company_id::text = current_setting('test.azienda', true) and current_setting('test.puo_leggere', true) = 'si');

    insert into public.prima_nota_entries
      select '${azienda}', '2026-01-08', 'entrata', 'incasso', 'Pagamento cliente',
        0.01, false, null, null, null, 'Cassa contanti'
      from generate_series(1, 1801);
    insert into public.prima_nota_entries values
      ('${azienda}', '2026-01-31', 'uscita', 'fornitore', 'Pagamento IMPRESA A', 40.35, false, 'costo', null, '${liquidita}', 'Cassa officina'),
      ('${azienda}', '2026-02-01', 'entrata', 'fornitore', 'Storno Impresa A', 40.35, true, 'storno_pagamento', null, '${liquidita}', 'Cassa officina'),
      ('${azienda}', '2026-02-02', 'uscita', 'fornitore', 'Pagamento Impresa banca', 60.12, false, 'costo', '${banca}', null, 'Banca collaudo'),
      ('${azienda}', '2026-03-01', 'entrata', 'incasso', 'Pagamento marzo', 100.00, true, 'invoice', '${banca}', null, 'Banca collaudo'),
      ('${altraAzienda}', '2026-01-31', 'uscita', 'fornitore', 'Pagamento IMPRESA A', 500.00, false, 'costo', null, null, 'Cassa officina');
  `);
  const migration = await readFile("supabase/migrations/20290502083000_prima_nota_riepilogo_filtrato.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
}, 30_000);

beforeEach(async () => {
  await db.exec(`set role authenticated; set test.azienda = '${azienda}'; set test.puo_leggere = 'si';`);
});

afterEach(() => db.exec("reset role;"));
afterAll(() => db.close());

async function riepilogo(filtri = "", id = azienda) {
  const { rows } = await db.query<{ mese: string | null; entrate: string; uscite: string; saldo: string; entry_count: number }>(
    `select mese::text, entrate, uscite, saldo, entry_count::int
       from public.prima_nota_riepilogo_filtrato($1${filtri})`,
    [id],
  );
  return rows.map(r => ({
    ...r, entrate: Number(r.entrate), uscite: Number(r.uscite), saldo: Number(r.saldo),
  }));
}

describe("Prima Nota, riepiloghi PostgreSQL", () => {
  it("somma l'intero periodo e conserva i centesimi oltre una pagina API", async () => {
    expect(await riepilogo(", p_from_date => '2026-01-01', p_to_date => '2026-01-31'"))
      .toEqual([{ mese: null, entrate: 18.01, uscite: 40.35, saldo: -22.34, entry_count: 1802 }]);
  });

  it("applica insieme date, direzione, categoria, origine, manuali, descrizione e cassa", async () => {
    expect(await riepilogo(`, p_from_date => '2026-01-31', p_to_date => '2026-02-28',
      p_direction => 'uscita', p_category => 'fornitore', p_is_auto => false, p_auto_source => 'costo',
      p_description_pattern => '%impres*%', p_account_label_pattern => 'cassa%'`))
      .toEqual([{ mese: null, entrate: 0, uscite: 40.35, saldo: -40.35, entry_count: 1 }]);
  });

  it("distingue banca e sottoconto, conserva lo storno e restituisce un totale per mese", async () => {
    expect(await riepilogo(`, p_from_date => '2026-01-01', p_to_date => '2026-02-28', p_bank_account_id => '${banca}'`))
      .toEqual([{ mese: null, entrate: 0, uscite: 60.12, saldo: -60.12, entry_count: 1 }]);
    expect(await riepilogo(`, p_conto_liquidita_id => '${liquidita}', p_monthly => true`)).toEqual([
      { mese: "2026-01-01", entrate: 0, uscite: 40.35, saldo: -40.35, entry_count: 1 },
      { mese: "2026-02-01", entrate: 40.35, uscite: 0, saldo: 40.35, entry_count: 1 },
    ]);
  });

  it("usa le policy dell'elenco per aziende e utenti senza accesso", async () => {
    expect(await riepilogo("", altraAzienda)).toEqual([]);
    await db.exec("set test.puo_leggere = 'no'");
    expect(await riepilogo()).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(riepilogo()).rejects.toMatchObject({ code: "42501" });
  });
});
