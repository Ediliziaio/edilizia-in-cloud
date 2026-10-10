// Isolated PostgreSQL (WASM), never connects to Supabase or sends messages.
// Install the pinned runner outside the repo, then set EIC_PGLITE_MODULE to
// its dist/index.js. Pass the rollout SQL path as the only command argument.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

if (!process.env.EIC_PGLITE_MODULE || !process.argv[2]) throw new Error('Set EIC_PGLITE_MODULE and pass a migration path');
const { PGlite } = await import(pathToFileURL(process.env.EIC_PGLITE_MODULE).href);
const db = new PGlite();
const sql = await readFile(process.argv[2], 'utf8');
const tenant = '11111111-2222-4333-8444-555555555555';
const platform = '00000000-0000-0000-0000-000000000001';
const ticket = '22222222-2222-4333-8444-555555555555';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.companies(id uuid primary key, name text, email text);
    create table public.support_tickets(id uuid primary key, company_id uuid, titolo text, urgenza text);
    create table public.company_status_events(id uuid primary key, company_id uuid, stato_da text, stato_a text, motivo text);
    create table public.subscription_invoices(id uuid primary key, period_end timestamptz);
    create table public.automation_trigger_events(company_id uuid, trigger_event text, entity_id text, entity_type text, payload jsonb, dedup_key text);
    create unique index on public.automation_trigger_events(dedup_key) where dedup_key is not null;
    alter table public.automation_trigger_events enable row level security;
    grant usage on schema public to authenticated;
    grant insert on public.support_tickets to authenticated;
    insert into public.companies values ('${tenant}', 'Azienda <test>', 'admin@example.test'), ('${platform}', 'Piattaforma', null);
    insert into public.support_tickets values ('${ticket}', '${tenant}', 'Storico', 'alta');
  `);
  // Apply twice: no backfill and no duplicate triggers.
  await db.exec(`begin; ${sql} commit;`);
  await db.exec(`begin; ${sql} commit;`);
  assert.equal((await db.query('select * from public.automation_trigger_events')).rows.length, 0);
  await db.exec(`delete from public.support_tickets where id='${ticket}'; set role authenticated;
    insert into public.support_tickets values ('${ticket}', '${tenant}', 'Nuovo ticket', 'alta'); reset role;`);
  let events = (await db.query('select * from public.automation_trigger_events')).rows;
  assert.equal(events.length, 1);
  assert.equal(events[0].company_id, platform);
  assert.equal(events[0].entity_type, 'ticket');
  assert.equal(events[0].payload['azienda.id'], tenant);
  assert.equal(events[0].payload['ticket.priorita'], 'alta');
  // Replayed ticket identity cannot enqueue twice; platform tickets are ignored.
  await db.exec(`delete from public.support_tickets where id='${ticket}';
    insert into public.support_tickets values ('${ticket}', '${tenant}', 'Replayed', 'alta');
    insert into public.support_tickets values ('33333333-2222-4333-8444-555555555555', '${platform}', 'Internal', 'alta');`);
  assert.equal((await db.query('select * from public.automation_trigger_events')).rows.length, 1);
  const statuses = [['active', 'active'], ['active', null], ['active', 'expired'], ['paused', 'paused'], ['active', 'suspended'], ['active', 'paused']];
  for (let i = 0; i < statuses.length; i++) {
    await db.query('insert into public.company_status_events values ($1,$2,$3,$4,$5)', [`44444444-2222-4333-8444-${String(i).padStart(12, '0')}`, tenant, ...statuses[i], 'Motivo vero']);
  }
  events = (await db.query("select * from public.automation_trigger_events where trigger_event='PLATFORM_COMPANY_PAUSED'")).rows;
  assert.equal(events.length, 2);
  assert.ok(events.every(e => e.payload['pausa.motivo'] === 'Motivo vero' && e.company_id === platform));
  for (const role of ['anon', 'authenticated']) for (const fn of ['enqueue_platform_support_ticket', 'enqueue_platform_company_pause']) {
    const { rows } = await db.query('select has_function_privilege($1, $2, $3) as allowed', [role, `public.${fn}()`, 'EXECUTE']);
    assert.equal(rows[0].allowed, false);
  }
  const funcs = (await db.query("select proconfig from pg_proc where proname in ('enqueue_platform_support_ticket','enqueue_platform_company_pause')")).rows;
  assert.equal(funcs.length, 2);
  assert.ok(funcs.every(f => f.proconfig.some(c => c.startsWith('search_path='))));
  const columns = (await db.query("select column_name from information_schema.columns where table_name='subscription_invoices' and column_name='due_date'")).rows;
  assert.equal(columns.length, 1);
  console.log('PASS: SQL applies twice; no backfill; tenant/platform isolation; ticket dedup; pause transitions; null status; restricted privileges; due_date.');
} finally { await db.close(); }
