/// <reference types="node" />
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();

beforeAll(async () => {
  await db.exec(`
    create schema private;
    create role anon;
    create role authenticated;
    create table order_work_phases (id uuid primary key, order_id uuid);
    create table order_work_subphases (
      id uuid primary key, phase_id uuid, fatta boolean default false, percentuale integer default 0,
      quantita_fatta numeric(14,3), fatta_il timestamptz
    );
    create table order_work_phase_voci (subphase_id uuid, unita text, quantita numeric);
    create table campo_rapportini (id uuid primary key, order_id uuid, stato text, annullato_at timestamptz, fasi_lavorate jsonb);
  `);
  const base = await readFile("supabase/migrations/20281213150000_rapportino_revoca_sicura.sql", "utf8");
  await db.exec(base.slice(base.indexOf("create table if not exists public.sottofasi_dal_rapportino"), base.indexOf("-- Revoca: si torna")));
  const coerenza = await readFile("supabase/migrations/20281207100000_avanzamento_della_sottofase.sql", "utf8");
  await db.exec(coerenza.slice(coerenza.indexOf("create or replace function public.sottofase_avanzamento_coerente"), coerenza.indexOf("-- Dal cantiere si può")));
  await db.exec("alter table public.sottofasi_dal_rapportino add fatta_dal_rapportino boolean not null default false");
  await db.exec(await readFile("supabase/migrations/20290430150700_rapportino_revoca_quantita_consecutive.sql", "utf8"));
  const anteprima = await readFile("supabase/migrations/20290502081700_anteprima_annullo_rapportino.sql", "utf8");
  await db.exec(anteprima.slice(0, anteprima.indexOf("-- Percentuale di fase")));
}, 30000);

afterAll(() => db.close());

async function commessa() {
  const [ordine, fase, voce] = Array.from({ length: 3 }, () => randomUUID());
  await db.query("insert into order_work_phases (id, order_id) values ($1, $2)", [fase, ordine]);
  await db.query("insert into order_work_subphases (id, phase_id) values ($1, $2)", [voce, fase]);
  await db.query("insert into order_work_phase_voci values ($1, 'm²', 100)", [voce]);
  return {
    approva: async (qta: number) => {
      const id = randomUUID();
      await db.query("insert into campo_rapportini (id, order_id, stato) values ($1, $2, 'approvato')", [id, ordine]);
      await db.query("select sottofase_applica_avanzata($1, $2, $3, null, current_date)", [id, voce, qta]);
      return id;
    },
    revoca: async (id: string) => {
      await db.query("update campo_rapportini set stato = 'rifiutato', annullato_at = now() where id = $1", [id]);
      await db.query("select sottofase_revoca_avanzata($1, $2)", [id, ordine]);
    },
    anteprima: async (id: string) => {
      const { rows: [row] } = await db.query<{ quantita: number | null; percentuale: number; esito: string }>(
        `select p.quantita::float8 as quantita, p.percentuale, p.esito from sottofasi_dal_rapportino a
          join order_work_subphases s on s.id = a.subphase_id
          cross join lateral private.sottofase_piano_revoca(a,s,$1) p where a.rapportino_id = $2`, [ordine, id],
      );
      return row;
    },
    rettifica: (quantita: number) => db.query("update order_work_subphases set quantita_fatta = $1::numeric, percentuale = $1::numeric::integer where id = $2", [quantita, voce]),
    misura: async () => {
      const { rows: [row] } = await db.query<{ quantita: number; percentuale: number; fatta: boolean }>(
        "select coalesce(quantita_fatta, 0)::float8 as quantita, percentuale, fatta from order_work_subphases where id = $1", [voce],
      );
      return [row.quantita, row.percentuale, row.fatta];
    },
  };
}

it.each([false, true])("storna esattamente i due rapportini anche fuori sequenza (%s)", async inverti => {
  const c = await commessa();
  const primo = await c.approva(20);
  const secondo = await c.approva(30);
  expect(await c.misura()).toEqual([50, 50, false]);
  const residuo = inverti ? 20 : 30;
  expect(await c.anteprima(inverti ? secondo : primo)).toEqual({ quantita: residuo, percentuale: residuo, esito: "ricalcolata" });
  expect(await c.misura()).toEqual([50, 50, false]);
  await c.revoca(inverti ? secondo : primo);
  expect(await c.misura()).toEqual(inverti ? [20, 20, false] : [30, 30, false]);
  await c.revoca(inverti ? primo : secondo);
  expect(await c.misura()).toEqual([0, 0, false]);
});

it("mantiene la misura inserita a mano tra due rapportini", async () => {
  const c = await commessa();
  const primo = await c.approva(20);
  await c.rettifica(45);
  const secondo = await c.approva(30);
  expect(await c.anteprima(primo)).toEqual({ quantita: 75, percentuale: 75, esito: "verifica" });
  await c.revoca(primo);
  expect(await c.misura()).toEqual([75, 75, false]);
  await c.revoca(secondo);
  expect(await c.misura()).toEqual([45, 45, false]);
});

it("non confonde una rettifica manuale con una fotografia precedente dello stesso valore", async () => {
  const c = await commessa();
  const primo = await c.approva(20);
  await c.approva(30);
  await c.rettifica(20);
  const ultimo = await c.approva(15);
  await c.revoca(primo);
  expect(await c.misura()).toEqual([35, 35, false]);
  await c.revoca(ultimo);
  expect(await c.misura()).toEqual([20, 20, false]);
});

it("ricalcola più fotografie e riapre la voce completata per quantità", async () => {
  const c = await commessa();
  const primo = await c.approva(40);
  const secondo = await c.approva(30);
  const ultimo = await c.approva(30);
  expect(await c.misura()).toEqual([100, 100, true]);
  await c.revoca(primo);
  expect(await c.misura()).toEqual([60, 60, false]);
  await c.revoca(secondo);
  expect(await c.misura()).toEqual([30, 30, false]);
  await c.revoca(ultimo);
  expect(await c.misura()).toEqual([0, 0, false]);
});
