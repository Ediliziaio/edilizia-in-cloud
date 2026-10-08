// Offline PostgreSQL regression tests. Always uses a new in-memory PGlite DB;
// never connects to Supabase. Pass the path to a temporary PGlite installation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const actor = "20000000-0000-4000-8000-000000000002";
const company = "10000000-0000-4000-8000-000000000001";
const key = "30000000-0000-4000-8000-000000000003";
const grant = "50000000-0000-4000-8000-000000000005";
let passed = 0;
const check = (value, expected, label) => { assert.deepEqual(value, expected, label); passed++; };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, banned_until timestamptz, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id', true),'')::uuid $$;
    create type public.app_role as enum ('super_admin','company_admin','company_staff');
    create table profiles (id uuid primary key, company_id uuid, is_blocked boolean default false, deleted_at timestamptz);
    create table user_roles (user_id uuid, role public.app_role);
    create table api_keys (id uuid primary key, created_by uuid, company_id uuid, is_active boolean, expires_at timestamptz,
      rate_limit_per_minute integer default 2, rate_limit_per_day integer default 5, sensitive_actions_per_day integer default 1, scopes text[] default array['*']);
    create table mcp_oauth_grants (id uuid primary key default gen_random_uuid(), user_id uuid, company_id uuid, revoked_at timestamptz,
      rate_limit_per_minute integer default 2, rate_limit_per_day integer default 5, sensitive_actions_per_day integer default 1,
      livello text default 'consulente', invii boolean default false, client_id text, client_name text, unique(client_id,user_id,company_id));
    create table multi_company_access (user_id uuid, company_id uuid, status text, access_role text, expires_at timestamptz);
    create function public.has_role(u uuid, r public.app_role) returns boolean language sql as
      $$ select exists(select 1 from public.user_roles where user_id=u and role=r) $$;
    create function public.get_user_company_id(u uuid) returns uuid language sql as
      $$ select company_id from public.profiles where id=u $$;
    create function public.has_permission_for_company(u uuid, p text, c uuid) returns boolean language sql as $$ select true $$;
    insert into profiles values ('${actor}', '${company}', false, null);
    insert into auth.users (id) values ('${actor}');
    insert into user_roles values ('${actor}', 'company_admin');
    insert into api_keys (id, created_by, company_id, is_active) values ('${key}', '${actor}', '${company}', true);
    insert into mcp_oauth_grants (id, user_id, company_id) values ('${grant}', '${actor}', '${company}');
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261008072044_mcp_connector_execution_safety.sql", import.meta.url), "utf8"));
  const auth = async (kind = "api_key", id = key) => (await db.query("select public.mcp_authorize_principal($1,$2) as allowed", [kind, id])).rows[0].allowed;
  check(await auth(), true, "active administrator");
  check(await auth("oauth", grant), true, "active OAuth administrator");
  await db.exec(`update auth.users set banned_until=now()+interval '1 day'`);
  check(await auth(), false, "banned auth account cannot keep using delegated API key");
  await db.exec(`update auth.users set banned_until=null`);
  await db.exec(`update profiles set is_blocked=true`);
  check(await auth(), false, "blocked actor immediately denied");
  await db.exec(`update profiles set is_blocked=false; update user_roles set role='company_staff'`);
  check(await auth(), false, "staff integration permission cannot bypass all company RLS");
  await db.exec(`update user_roles set role='company_admin'; update api_keys set expires_at=now()-interval '1 minute'`);
  check(await auth(), false, "expired key");
  await db.exec(`update api_keys set expires_at=null, company_id=null`);
  check(await auth(), false, "platform key requires super admin");
  await db.exec(`update user_roles set role='super_admin'`);
  check(await auth(), true, "super admin platform key");
  await db.exec(`update user_roles set role='company_admin'; update api_keys set company_id='${company}'; update mcp_oauth_grants set revoked_at=now()`);
  check(await auth("oauth", grant), false, "revoked OAuth");
  const fingerprint = "a".repeat(64);
  const reqA = "40000000-0000-4000-8000-000000000004";
  const reqB = "60000000-0000-4000-8000-000000000006";
  const reqC = "70000000-0000-4000-8000-000000000007";
  const reserve = async (id, sensitive = false, hash = fingerprint) => (await db.query(
    "select public.mcp_reserve_tool_call('api_key',$1,$2,$3,$4,null,$5,$6) as result", [key, id, hash, sensitive, company, actor]
  )).rows[0].result;
  const concurrent = await Promise.all([reserve(reqA, true), reserve(reqA, true)]);
  check(concurrent.filter(r => r.ok).length, 1, "one request starts, duplicate remains pending");
  const started = concurrent.find(r => r.ok);
  const response = { content: [{ type: "text", text: "created once" }] };
  check((await db.query("select public.mcp_complete_tool_call($1,$2) as completed", [started.receipt, response])).rows[0].completed, true, "completion");
  check((await reserve(reqA, true)).response, response, "cached result returned without executing again");
  check((await reserve(reqA, true, "b".repeat(64))).ok, false, "changed payload rejected");
  check((await reserve(reqB, true)).ok, false, "sensitive quota includes already reserved calls");
  check((await reserve(reqB)).ok, true, "second ordinary call allowed");
  check((await reserve(reqC)).ok, false, "minute quota cannot be raced");
  await db.exec(`update api_keys set scopes=array['quotes:read']`);
  check((await db.query("select public.mcp_reserve_tool_call('api_key',$1,$2,$3,true,'email:send',$4,$5) as result", [key, reqA, fingerprint, company, actor])).rows[0].result.ok, false, "scope downgrade invalidates replay");
  await db.exec(`update profiles set is_blocked=true`);
  check((await reserve(reqA, true)).ok, false, "cached data inaccessible after actor revocation");
  await db.exec(`update profiles set is_blocked=false; select set_config('test.user_id','${actor}',false);`);
  const consent = async c => (await db.query("select public.mcp_oauth_upsert_grant('client-test',$1,'operativo',true,'ChatGPT') as id", [c])).rows[0].id;
  const firstGrant = await consent(company);
  check(await auth("oauth", firstGrant), true, "consent creates authorized company grant");
  const secondCompany = "80000000-0000-4000-8000-000000000008";
  await db.exec(`insert into multi_company_access values ('${actor}','${secondCompany}','active','company_admin',null)`);
  const secondGrant = await consent(secondCompany);
  check(await auth("oauth", firstGrant), false, "switching company revokes old tenant grant");
  check(await auth("oauth", secondGrant), true, "new company bound to active administrator");
  check((await db.query("select count(*)::integer as n from mcp_oauth_grants where client_id='client-test' and revoked_at is null")).rows[0].n, 1, "one company per client token");
  await db.exec(`update profiles set is_blocked=true`);
  await assert.rejects(consent(company), /amministratore attivo/);
  check((await db.query("select revoked_at is not null as revoked from mcp_oauth_grants where id=$1", [firstGrant])).rows[0].revoked, true, "failed authorization rolled back, old revoked grant not reactivated");
  for (const role of ["anon", "authenticated"]) {
    check((await db.query("select has_table_privilege($1,'public.mcp_tool_requests','select') as allowed", [role])).rows[0].allowed, false, `${role} cannot read receipts`);
    check((await db.query("select has_function_privilege($1,'public.mcp_reserve_tool_call(text,uuid,uuid,text,boolean,text,uuid,uuid)','execute') as allowed", [role])).rows[0].allowed, false, `${role} cannot reserve service operations`);
  }
  console.log(`MCP PostgreSQL safety: ${passed} assertions passed (offline, no production writes).`);
} finally { await db.close(); }
