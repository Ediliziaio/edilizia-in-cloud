// In-memory PostgreSQL (PGlite), no production connection, no provider calls.
// Pass the absolute path to an externally installed @electric-sql/pglite module.
// Example: node scripts/check-ai-provider-guard-local.mjs /tmp/test/node_modules/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let passed = 0;
const check = async (label, fn) => { await fn(); passed++; console.log(`PASS ${label}`); };
const migration = new URL("../supabase/migrations/20261007164041_ai_provider_request_safety.sql", import.meta.url);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.ai_call_ledger (idempotency_key text primary key, company_id uuid, user_id uuid, task_key text);
    grant select on public.ai_call_ledger to service_role;`);
  await db.exec(await readFile(migration, "utf8"));
  const company = "11111111-1111-4111-8111-111111111111", user = "22222222-2222-4222-8222-222222222222";
  const owner = "33333333-3333-4333-8333-333333333333", stranger = "44444444-4444-4444-8444-444444444444";
  const key = "a".repeat(64), input = "b".repeat(64), provider = "c".repeat(64);
  const claim = async (overrides = {}) => {
    const p = { key, company, user, task: "persona_silvio", input, owner, provider, legacy: "legacy-request", ...overrides };
    const result = await db.query("select public.ai_provider_request_claim($1,$2,$3,$4,$5,$6,$7,$8) as value",
      [p.key, p.company, p.user, p.task, p.input, p.owner, p.provider, p.legacy]);
    return result.rows[0].value;
  };
  const finish = async (pKey, pOwner, result, failure = null, blocked = false) =>
    (await db.query("select public.ai_provider_request_finish($1,$2,$3,$4,$5) as value", [pKey, pOwner, result, failure, blocked])).rows[0].value;
  await check("migration RLS and invoker-only permissions", async () => {
    const rows = (await db.query("select relname, relrowsecurity from pg_class where relname in ('ai_provider_requests','ai_provider_cooldowns')")).rows;
    assert.equal(rows.length, 2); assert(rows.every(r => r.relrowsecurity));
    const access = (await db.query(`select has_function_privilege('authenticated', 'public.ai_provider_request_claim(text,uuid,uuid,text,text,uuid,text,text)', 'execute') as access`)).rows[0];
    assert.equal(access.access, false);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.ai_provider_requests"), /permission denied/);
    await db.exec("reset role; set role service_role");
  });
  await check("one durable claim; duplicate remains in progress", async () => {
    assert.equal((await claim()).state, "claimed");
    assert.equal((await claim({ owner: stranger })).state, "in_progress");
  });
  await check("scope and fingerprint cannot read another result", async () => {
    for (const change of [{ company: stranger }, { user: stranger }, { task: "another" }, { input: "d".repeat(64) }]) {
      assert.equal((await claim(change)).state, "request_conflict");
    }
  });
  await check("checkpoint and completion require the winning owner", async () => {
    assert.equal(await finish(key, stranger, { content: "invalid" }), false);
    const saved = await db.query("select public.ai_provider_request_checkpoint($1,$2,$3) as value", [key, owner, { generation_id: "gen-local-test", cost_usd: 0.04 }]);
    assert.equal(saved.rows[0].value, true);
    assert.equal(await finish(key, owner, { content: "cached answer", costBilledEur: 0.12 }), true);
    assert.equal(await finish(key, owner, null, "late failure"), false);
  });
  await check("completed requests replay without a new claim", async () => {
    assert.deepEqual(await claim(), { state: "completed", result: { content: "cached answer", costBilledEur: 0.12 } });
  });
  await check("expired responses are redacted but never recharged", async () => {
    await db.query("update public.ai_provider_requests set result_expires_at = now() - interval '1 day' where request_key=$1", [key]);
    await db.query("select public.ai_provider_request_redact_expired()");
    assert.equal((await claim()).state, "reconciliation_required");
    assert.equal((await db.query("select result from public.ai_provider_requests where request_key=$1", [key])).rows[0].result, null);
  });
  await check("crashed requests cannot be taken over after a timeout", async () => {
    const crash = "d".repeat(64);
    assert.equal((await claim({ key: crash })).state, "claimed");
    await db.query("update public.ai_provider_requests set updated_at=now()-interval '1 hour' where request_key=$1", [crash]);
    assert.equal((await claim({ key: crash, owner: stranger })).state, "reconciliation_required");
  });
  await check("provider 402 cooldown is shared across workers and scoped to the key", async () => {
    const failed = "e".repeat(64);
    assert.equal((await claim({ key: failed })).state, "claimed");
    assert.equal(await finish(failed, owner, null, "provider_credit", true), true);
    assert.equal((await claim({ key: "f".repeat(64) })).state, "provider_cooldown");
    assert.equal((await claim({ key: "f".repeat(64), provider: "0".repeat(64) })).state, "claimed");
    await db.query("update public.ai_provider_cooldowns set blocked_until=now()-interval '1 minute'");
    assert.equal((await claim({ key: "1".repeat(64) })).state, "claimed");
  });
  await check("legacy ledger stops provider re-spend", async () => {
    await db.exec("reset role");
    await db.query("insert into public.ai_call_ledger values ($1,$2,$3,$4)", ["old-paid-key", company, user, "persona_silvio"]);
    await db.exec("set role service_role");
    assert.equal((await claim({ key: "2".repeat(64), legacy: "old-paid-key" })).state, "legacy_reconciliation_required");
  });
  console.log(`${passed} SQL checks passed. Isolated PGlite; not a multi-connection PostgreSQL load test.`);
} finally { await db.close(); }
