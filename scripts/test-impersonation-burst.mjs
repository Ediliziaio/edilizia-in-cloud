// Solo PostgreSQL WASM locale, nessun accesso al progetto Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.edge_function_rate_limits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),function_name text NOT NULL,
      caller_id text NOT NULL,called_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX rate_lookup ON public.edge_function_rate_limits(function_name,caller_id,called_at DESC);
    ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.edge_function_rate_limits TO service_role;`);
  const sql = readFileSync('supabase/migrations/20261016144414_impersonazione_antiraffica.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  await db.exec('SET ROLE service_role');
  const start = async (id=admin) => (await db.query('select public.impersonation_start_burst($1::uuid) as result',[id])).rows[0].result;
  for(let i=0;i<10;i++) assert.equal((await start()).allowed,true);
  const denied = await start();
  assert.equal(denied.allowed,false);
  assert.ok(denied.retry_after_seconds>=1 && denied.retry_after_seconds<=10);
  assert.equal((await start(other)).allowed,true,'amministratori separati');
  assert.equal((await db.query('select count(*)::int as n from public.edge_function_rate_limits where caller_id=$1',[admin])).rows[0].n,10,'rifiuto non allunga la finestra');
  await db.query("update public.edge_function_rate_limits set called_at=clock_timestamp()-interval '11 seconds'");
  // Ben oltre dieci accessi nell'ora: il normale utilizzo riparte dopo pochi secondi.
  for(let i=0;i<15;i++) {
    assert.equal((await start()).allowed,true);
    await db.query("update public.edge_function_rate_limits set called_at=clock_timestamp()-interval '11 seconds' where caller_id=$1",[admin]);
  }
  await assert.rejects(start(null),/admin required/);
  for(const role of ['anon','authenticated']) {
    await db.exec(`RESET ROLE; SET ROLE ${role}`);
    await assert.rejects(start(),/permission denied/);
  }
  console.log('PostgreSQL locale: antiraffica, ripresa, assenza quota oraria, isolamento, permessi e idempotenza OK.');
} finally { await db.close(); }
