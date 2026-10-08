// Isolated PGlite, synthetic identities only. No real tenant, network or message.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const c1 = "11111111-1111-4111-8111-111111111111", c2 = "22222222-2222-4222-8222-222222222222";
const n1 = "33333333-3333-4333-8333-333333333333", n2 = "44444444-4444-4444-8444-444444444444";
const emp = "55555555-5555-4555-8555-555555555555", user = "66666666-6666-4666-8666-666666666666";
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table companies(id uuid primary key); create table employees(id uuid primary key);
    create table ai_whatsapp_numbers(id uuid primary key);
    create table whatsapp_sessions(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies,
      operaio_id uuid not null references employees, phone_number text not null, state_data jsonb default '{}');
    create unique index idx_wa_sessions_phone on whatsapp_sessions(phone_number);
    grant all on whatsapp_sessions to authenticated, anon;
    insert into companies values ('${c1}'), ('${c2}'); insert into employees values ('${emp}');
    insert into ai_whatsapp_numbers values ('${n1}'), ('${n2}'); insert into auth.users values ('${user}');
    insert into whatsapp_sessions(company_id,operaio_id,phone_number,state_data) values ('${c1}','${emp}','0000','{"legacy":true}');`);
  const migration = await readFile(new URL("../supabase/migrations/20261007172959_whatsapp_scoped_operator_sessions.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await check("migration is repeatable and retains legacy sessions", async () => {
    await db.exec(migration);
    assert.deepEqual((await db.query("select state_data from whatsapp_sessions where wa_number_id is null")).rows, [{ state_data: { legacy: true } }]);
  });
  await check("browser cannot forge confirmations; service can write", async () => {
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await db.query(`select has_table_privilege('${role}','public.whatsapp_sessions','UPDATE') as ok`)).rows[0].ok, false);
      assert.equal((await db.query(`select has_table_privilege('${role}','public.whatsapp_sessions','INSERT') as ok`)).rows[0].ok, false);
    }
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='whatsapp_sessions'::regclass")).rows[0].relrowsecurity, true);
    await db.exec("set role service_role");
  });
  await check("admin without employee can create a session, employee FK is not a user ID", async () => {
    await db.query("insert into whatsapp_sessions(company_id,wa_number_id,user_id,phone_number) values ($1,$2,$3,'0000')", [c1,n1,user]);
    await assert.rejects(db.query("insert into whatsapp_sessions(company_id,wa_number_id,operaio_id,phone_number) values ($1,$2,$3,'bad')", [c1,n1,user]), /foreign key/);
    await assert.rejects(db.query("insert into whatsapp_sessions(company_id,wa_number_id,phone_number) values ($1,$2,'anonymous')", [c1,n1]), /check constraint/);
  });
  await check("same sender can use different numbers or companies without collisions", async () => {
    await db.query("insert into whatsapp_sessions(company_id,wa_number_id,operaio_id,phone_number) values ($1,$2,$3,'0000')", [c1,n2,emp]);
    await db.query("insert into whatsapp_sessions(company_id,wa_number_id,user_id,phone_number) values ($1,$2,$3,'0000')", [c2,n2,user]);
    await assert.rejects(db.query("insert into whatsapp_sessions(company_id,wa_number_id,user_id,phone_number) values ($1,$2,$3,'0000')", [c1,n1,user]), /unique constraint/);
  });
  await check("compare-and-swap consumes once without erasing unrelated state", async () => {
    const before = { other: 1, bot_conferma: { azione: "carica_ddt", numero_id: n1 } };
    await db.query("update whatsapp_sessions set state_data=$1 where company_id=$2 and wa_number_id=$3", [before,c1,n1]);
    const update = () => db.query("update whatsapp_sessions set state_data=$1 where company_id=$2 and wa_number_id=$3 and state_data=$4 returning id", [{ other: 1 },c1,n1,before]);
    assert.equal((await update()).rows.length, 1);
    assert.equal((await update()).rows.length, 0);
    assert.deepEqual((await db.query("select state_data from whatsapp_sessions where company_id=$1 and wa_number_id=$2", [c1,n1])).rows[0].state_data, { other: 1 });
  });
  console.log(`${passed} SQL checks passed (isolated PGlite, not a multi-connection load test).`);
} finally { await db.close(); }
