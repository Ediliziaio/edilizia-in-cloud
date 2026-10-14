// Real PostgreSQL (WASM), LOCAL ONLY. No production credentials or network.
// Install a pinned test runtime in a temporary directory, then:
// PGLITE_TEST_ROOT=/tmp/your-test-runtime node scripts/test-calendar-lease.mjs
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const requireTest = createRequire(resolve(process.env.PGLITE_TEST_ROOT || ".","package.json"));
const { PGlite } = requireTest("@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.google_calendar_connections (id uuid PRIMARY KEY,company_id uuid,user_id uuid,status text);
    INSERT INTO public.google_calendar_connections VALUES ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','connected');
    GRANT ALL ON public.google_calendar_connections TO service_role;
    CREATE TABLE public.google_calendar_busy_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,user_id uuid NOT NULL,
      google_event_id text NOT NULL,google_calendar_id text NOT NULL,summary text,
      start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,is_all_day boolean NOT NULL,
      created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX uq_gcal_busy_slots_event ON public.google_calendar_busy_slots(company_id,user_id,google_event_id);
    ALTER TABLE public.google_calendar_busy_slots ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.google_calendar_busy_slots TO service_role;`);
  const sql=readFileSync("supabase/migrations/20281014130000_gcal_busy_lease_preparazione.sql","utf8") + readFileSync("supabase/migrations-pending/calendario_occupazioni_identita_calendario.sql","utf8");
  await db.exec(sql); await db.exec(sql); // Idempotence as well as syntax.
  await db.exec("SET ROLE service_role");
  const company="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222";
  const a="33333333-3333-4333-8333-333333333333",b="44444444-4444-4444-8444-444444444444";
  const connection="55555555-5555-4555-8555-555555555555";
  const call=async(name,params,types)=> (await db.query(`select public.${name}(${types.map((t,i)=>`$${i+1}::${t}`).join(",")}) as value`,params)).rows[0].value;
  const scope=[company,user,"primary"],types=["uuid","uuid","text","uuid","uuid"];
  assert.equal(await call("gcal_busy_claim",[...scope,a,connection],types),true);
  assert.equal(await call("gcal_busy_claim",[...scope,b,connection],types),false);
  const row={company_id:company,user_id:user,google_calendar_id:"primary",google_event_id:"same-id",summary:"Busy",start_at:"2026-10-13T10:00:00Z",end_at:"2026-10-13T11:00:00Z",is_all_day:false};
  const batch=(owner,rows,ids=[],calendar="primary")=>call("gcal_busy_batch",[company,user,calendar,owner,connection,JSON.stringify(rows),ids],[...types,"jsonb","uuid[]"]);
  assert.deepEqual(await batch(a,[row]),{written:1,removed:0});
  const id=(await db.query("select id from public.google_calendar_busy_slots")).rows[0].id;
  await db.query("update public.google_calendar_sync_leases set expires_at=clock_timestamp()-interval '1 second'");
  assert.equal(await call("gcal_busy_claim",[...scope,b,connection],types),true);
  await assert.rejects(batch(a,[],[id]),/lease lost/i);
  await assert.rejects(batch(a,[{...row,summary:"stale"}]),/lease lost/i);
  await call("gcal_busy_release",[...scope,a,connection],types);
  assert.equal((await db.query("select owner_token from public.google_calendar_sync_leases")).rows[0].owner_token,b);
  await assert.rejects(batch(b,[{...row,company_id:user}]),/scope/i);
  await assert.rejects(batch(b,Array.from({length:101},()=>row)),/batch/i);
  assert.equal(await call("gcal_busy_claim",[company,user,"other",a,connection],types),true);
  assert.deepEqual(await batch(a,[{...row,google_calendar_id:"other"}],[],"other"),{written:1,removed:0});
  const otherId=(await db.query("select id from public.google_calendar_busy_slots where google_calendar_id='other'")).rows[0].id;
  assert.deepEqual(await batch(b,[],[otherId]),{written:0,removed:0});
  assert.equal((await db.query("select count(*)::int as n from public.google_calendar_busy_slots")).rows[0].n,2);
  await db.query("update public.google_calendar_connections set status='revoked'");
  await assert.rejects(batch(b,[row]),/disconnected/i);
  assert.equal(await call("gcal_busy_claim",[company,user,"new",a,connection],types),false);
  await db.exec("RESET ROLE; SET ROLE authenticated");
  await assert.rejects(call("gcal_busy_claim",[...scope,a,connection],types),/permission denied/i);
  await assert.rejects(db.query("select * from public.google_calendar_sync_leases"),/permission denied/i);
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(batch(b,[row]),/permission denied/i);
  console.log("PostgreSQL locale: idempotenza, claim esclusivo, fencing, scope, limite batch e permessi verificati.");
} finally { await db.close(); }
