/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const azienda = "3e000000-0000-4000-8000-000000000001";
const cliente = "3e000000-0000-4000-8000-000000000002";
const impianto = "3e000000-0000-4000-8000-000000000003";
const contratto = "3e000000-0000-4000-8000-000000000004";
const storico = "3e000000-0000-4000-8000-000000000005";
const piano = "3e000000-0000-4000-8000-000000000006";
const operazione = "3e000000-0000-4000-8000-000000000007";
const altraOperazione = "3e000000-0000-4000-8000-000000000008";

beforeAll(async () => {
  await db.exec(`
    create schema auth;
    create role anon;
    create role authenticated;
    create table companies (id uuid primary key);
    create table profiles (id uuid primary key);
    create table orders (id uuid primary key);
    create table rapportini_intervento (id uuid primary key);
    create table tickets (id uuid primary key);
    create function auth.uid() returns uuid language sql immutable as $$ select '${cliente}'::uuid $$;
    create function public.get_my_company_id() returns uuid language sql immutable as $$ select '${azienda}'::uuid $$;
    insert into companies values ('${azienda}');
    insert into profiles values ('${cliente}');
  `);
  const leggiMigrazione = (nome: string) => readFile(`supabase/migrations/${nome}.sql`, "utf8");
  await db.exec(await leggiMigrazione("20260809000002_manutenzione"));
  await db.exec(await leggiMigrazione("20260813000001_piano_contratto_nullable"));
  await db.exec(`
    insert into impianti_cliente(id, company_id, customer_id, tipo_impianto)
      values ('${impianto}', '${azienda}', '${cliente}', 'caldaia');
    insert into contratti_manutenzione(id, company_id, impianto_id, customer_id, nome_contratto, data_inizio)
      values ('${contratto}', '${azienda}', '${impianto}', '${cliente}', 'Contratto', '2026-11-01');
    insert into piani_manutenzione(id, contratto_id, company_id, titolo, frequenza_tipo)
      values ('${storico}', '${contratto}', '${azienda}', 'Piano precedente', 'mensile');
  `);
  await db.exec(await leggiMigrazione("20290502081800_piano_manutenzione_impianto"));
}, 20_000);

afterAll(() => db.close());

it("recupera il legame a contratto e registra una sola esecuzione sul piano senza contratto", async () => {
  expect((await db.query("select impianto_id from piani_manutenzione where id = $1", [storico])).rows)
    .toEqual([{ impianto_id: impianto }]);
  await db.query(`
    insert into piani_manutenzione(id, impianto_id, company_id, titolo, frequenza_tipo)
      values ($1, $2, $3, 'Piano gratuito', 'mensile')
  `, [piano, impianto, azienda]);
  const registra = (id: string) => db.query(`
    select manutenzione_registra_esecuzione($1, $2, $3, '2026-11-23', 'ok', null, true) as id
  `, [piano, impianto, id]);
  expect((await registra(operazione)).rows).toEqual([{ id: operazione }]);
  expect((await registra(operazione)).rows).toEqual([{ id: operazione }]);
  await expect(registra(altraOperazione)).rejects.toMatchObject({ code: "PT409" });
  expect((await db.query("select id from esecuzioni_manutenzione where piano_id = $1", [piano])).rows)
    .toEqual([{ id: operazione }]);
  expect((await db.query("select prossima_scadenza::text from piani_manutenzione where id = $1", [piano])).rows)
    .toEqual([{ prossima_scadenza: "2026-12-23" }]);
});
