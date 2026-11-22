import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const a = "70111111-1111-4111-8111-111111111111";
const b = "70222222-2222-4222-8222-222222222222";
const dispositivo = "a".repeat(64);
const altroDispositivo = "b".repeat(64);
const token = "t".repeat(48);
const nuovoToken = "n".repeat(48);

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    grant usage on schema auth to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.user', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create table auth.users(id uuid primary key);
    create table public.companies(id uuid primary key);
    create table public.profiles(id uuid primary key, company_id uuid);
    create function public.utente_bloccato() returns boolean language sql stable as $$ select false $$;
    insert into auth.users values ('${a}'), ('${b}');
  `);
  const migrazione = (nome: string) => readFileSync(`supabase/migrations/${nome}.sql`, "utf8");
  await db.transaction(tx => tx.exec(migrazione("20260916000029_push_tokens")));
  await db.exec("grant select, insert, update, delete on public.push_tokens to authenticated");
  const registrazione = migrazione("20290506180000_dispositivi_push_mobile");
  await db.transaction(tx => tx.exec(registrazione));
  await db.transaction(tx => tx.exec(registrazione));
});
afterAll(async () => { await db.close(); });

const come = (utente: string, sql: string, parametri: string[] = []) => db.transaction(async tx => {
  await tx.query("select set_config('test.user', $1, true)", [utente]);
  await tx.exec("set local role authenticated");
  return (await tx.query(sql, parametri)).rows;
});
const registra = (utente: string, chiave: string, valore: string, autore = utente) =>
  come(utente, "select registra_dispositivo_push($1,$2,$3,'android')", [autore, chiave, valore]);

it("mantiene un solo recapito per installazione dopo la rotazione e il cambio account", async () => {
  await registra(a, dispositivo, token);
  await registra(a, dispositivo, token);
  await registra(a, dispositivo, nuovoToken);
  expect((await come(a, "select token from push_tokens"))).toEqual([{ token: nuovoToken }]);
  await expect(registra(b, altroDispositivo, nuovoToken)).rejects.toMatchObject({ code: "42501" });
  await registra(b, dispositivo, nuovoToken);
  expect((await come(a, "select token from push_tokens"))).toEqual([]);
  expect((await come(b, "select token from push_tokens"))).toEqual([{ token: nuovoToken }]);
  await come(a, "select disattiva_dispositivo_push($1,$2)", [a, dispositivo]);
  expect((await come(b, "select token from push_tokens"))).toEqual([{ token: nuovoToken }]);
  await come(b, "select disattiva_dispositivo_push($1,$2)", [b, dispositivo]);
  expect((await come(b, "select token from push_tokens"))).toEqual([]);
});

it("controlla chi registra e impedisce la scrittura diretta dei token agli utenti", async () => {
  await expect(registra(a, dispositivo, token, b)).rejects.toMatchObject({ code: "42501" });
  await expect(registra(a, "chiave-errata", token)).rejects.toMatchObject({ code: "22023" });
  await expect(come(a, "insert into push_tokens(user_id,token,platform) values ($1,$2,'android')", [a, token]))
    .rejects.toMatchObject({ code: "42501" });
});
