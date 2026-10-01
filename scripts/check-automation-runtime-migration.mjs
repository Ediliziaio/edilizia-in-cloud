// Isolated PostgreSQL/WASM regression checks. Never connects to Supabase.
// node scripts/check-automation-runtime-migration.mjs /path/to/pglite/dist/index.js
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const company = '00000000-0000-4000-a000-000000000001';
const flow = '00000000-0000-4000-a000-000000000002';
const other = '00000000-0000-4000-a000-000000000003';
const node = '00000000-0000-4000-a000-000000000004';
const entity = '00000000-0000-4000-a000-000000000005';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true),'')::uuid$$;
create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.super',true)='true',false) or $3=nullif(current_setting('test.company',true),'')::uuid or $3=nullif(current_setting('test.allowed_company',true),'')::uuid$$;
create function public.utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true)='true',false)$$;
create table automation_flows(id uuid primary key, company_id uuid, version integer not null default 1, status text default 'draft', config_json jsonb default '{}', allow_reentry boolean default false, updated_at timestamptz default now());
create table automation_nodes(id uuid primary key, flow_id uuid references automation_flows on delete cascade, company_id uuid, node_type text check(node_type in ('trigger','action','condition','delay','goal','split')), position_x float,position_y float,config_json jsonb,label text);
create table automation_connections(id uuid primary key, flow_id uuid references automation_flows on delete cascade, company_id uuid, from_node_id uuid references automation_nodes on delete cascade,to_node_id uuid references automation_nodes on delete cascade,label text);
create table automation_enrollments(id uuid primary key default gen_random_uuid(),flow_id uuid references automation_flows on delete cascade,company_id uuid,entity_id text,entity_type text,flow_version integer default 1,status text);
create table automation_trigger_events(id uuid default gen_random_uuid(),company_id uuid,trigger_event text,entity_id text,entity_type text,payload jsonb);
create table automation_flow_versions(id uuid default gen_random_uuid(),flow_id uuid,company_id uuid,version integer,status text,nodes_snapshot jsonb,connections_snapshot jsonb,created_by uuid);
grant usage on schema public,auth to authenticated; grant all on all tables in schema public to authenticated;
alter table automation_flows enable row level security;
create policy tenant on automation_flows to authenticated using (public.has_permission_for_company(auth.uid(),'can_view_automazioni',company_id)) with check (public.has_permission_for_company(auth.uid(),'can_view_automazioni',company_id) and not public.utente_sola_lettura(company_id));
alter table automation_flow_versions enable row level security;
create policy own_versions_read on automation_flow_versions for select to authenticated using (company_id=nullif(current_setting('test.company',true),'')::uuid);
create policy own_versions_insert on automation_flow_versions for insert to authenticated with check (company_id=nullif(current_setting('test.company',true),'')::uuid);
set test.uid='${entity}'; set test.company='${company}';
insert into automation_flows(id,company_id) values('${flow}','${company}'),('${other}','${company}');
insert into automation_nodes(id,flow_id,company_id,node_type,config_json) values('${node}','${flow}','${company}','trigger','{}');
`);
// Install the exact existing emitter definition, without unrelated migration statements.
const crm = await readFile(new URL('../supabase/migrations/20280922230000_prenotazione_collegata_crm.sql', import.meta.url), 'utf8');
await db.exec(crm.slice(crm.indexOf('CREATE OR REPLACE FUNCTION'), crm.indexOf('$function$;') + '$function$;'.length));
await db.exec(`create table marketing_contacts(id uuid, company_id uuid, email text, phone text, first_name text, last_name text, city text,address text,province text,region text,postal_code text,source text,assigned_to uuid,tags text[],company_name text,contact_type text);
insert into marketing_contacts(id,company_id,tags) values('${entity}','${company}',array['old']);
create trigger test_crm after update on marketing_contacts for each row execute function fire_marketing_automation();`);
const sql = await readFile(new URL('../supabase/migrations/20260930173612_automation_runtime_guards.sql', import.meta.url), 'utf8');
await db.exec(`begin; ${sql} commit;`);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const revision = async () => (await one('select updated_at::text as revision from automation_flows where id=$1',[flow])).revision;
const graph = [{id:node,node_type:'trigger',config_json:{item_id:'contatto_creato'},position_x:0,position_y:0}];
const save = async (nodes=graph, connections=[], stamp=null, companyId=company) => one('select save_automation_graph($1,$2,$3,$4,$5) as saved',[flow,companyId,stamp??await revision(),JSON.stringify(nodes),JSON.stringify(connections)]);
const enroll = (status='active',type='contact',version=1) => db.query('insert into automation_enrollments(flow_id,company_id,entity_id,entity_type,flow_version,status) values($1,$2,$3,$4,$5,$6)',[flow,company,entity,type,version,status]);
let passed=0;
async function test(name, fn) {
  await db.exec('begin');
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  finally { await db.exec('rollback'); }
}
await test('atomic graph save and snapshots',async()=>{
  const {saved}=await save(); assert.equal(saved.version,2);
  assert.equal((await one('select count(*)::int as n from automation_flow_versions')).n,2);
});
await test('stale revision is rejected',async()=>{
  const stamp=await revision(); await save();
  await assert.rejects(()=>save(graph,[],stamp),/modificato altrove/);
});
await test('invalid node rolls back every write',async()=>{
  await db.exec('savepoint bad');
  await assert.rejects(()=>save([{...graph[0],node_type:'invalid'}]));
  await db.exec('rollback to bad');
  assert.equal((await one('select version from automation_flows where id=$1',[flow])).version,1);
  assert.equal((await one('select config_json from automation_nodes where id=$1',[node])).config_json.item_id,undefined);
  assert.equal((await one('select count(*)::int as n from automation_flow_versions')).n,0);
});
await test('dangling edges rejected',async()=>{
  await assert.rejects(()=>save(graph,[{id:entity,from_node_id:node,to_node_id:other}]),/mancante/);
});
await test('cross-flow node cannot be reused',async()=>{
  await db.query("insert into automation_nodes(id,flow_id,company_id,node_type) values($1,$2,$3,'action')",[entity,other,company]);
  await assert.rejects(()=>save([{...graph[0],id:entity}]),/altro flusso/);
});
for (const status of ['active','waiting','paused']) await test(`graph protected during ${status} execution`,async()=>{
  await enroll(status); await assert.rejects(()=>save(),/esecuzioni in corso/);
});
await test('legacy direct deletion is also protected',async()=>{
  await enroll(); await assert.rejects(()=>db.query('delete from automation_nodes where id=$1',[node]),/esecuzioni in corso/);
});
for (const status of ['waiting','paused']) await test(`${status} enrollment blocks duplicate`,async()=>{
  await enroll(status); await assert.rejects(()=>enroll(),/già iscritta/);
});
await test('version race prevents enrollment into wrong graph',async()=>{
  await save(); await assert.rejects(()=>enroll(),/Versione cambiata/);
});
for(const type of ['stock_movement','manutenzione','contratto_manutenzione']) await test(`supported entity ${type}`,()=>enroll('active',type));
await test('event occurrence deduplicated atomically',async()=>{
  await db.exec("insert into automation_trigger_events(dedup_key) values('same')");
  await assert.rejects(()=>db.exec("insert into automation_trigger_events(dedup_key) values('same')"),/unique/);
});
await test('authenticated company may save',async()=>{
  await db.exec('set local role authenticated'); const {saved}=await save(); assert.equal(saved.version,2);
});
await test('superadmin can snapshot a company flow outside their own company',async()=>{
  await db.exec(`set local role authenticated; set local test.company='${other}'; set local test.super='true'`);
  const {saved}=await save(); assert.equal(saved.version,2);
  assert.equal((await one('select count(*)::int as n from automation_flow_versions')).n,2);
});
await test('authorized multi-company editor can save and read snapshots',async()=>{
  await db.exec(`set local role authenticated; set local test.company='${other}'; set local test.allowed_company='${company}'`);
  const {saved}=await save(); assert.equal(saved.version,2);
  assert.equal((await one('select count(*)::int as n from automation_flow_versions')).n,2);
});
await test('read-only access does not grant snapshot insert permission',async()=>{
  await db.exec(`set local role authenticated; set local test.company='${other}'; set local test.allowed_company='${company}'; set local test.readonly='true'`);
  await assert.rejects(()=>db.query('insert into automation_flow_versions(flow_id,company_id,version) values($1,$2,1)',[flow,company]),/row-level security/);
});
await test('snapshot reader cannot see another company',async()=>{
  await save();
  await db.exec(`set local role authenticated; set local test.company='${other}'`);
  assert.equal((await one('select count(*)::int as n from automation_flow_versions')).n,0);
});
await test('other company cannot save',async()=>{
  const stamp=await revision(); await db.exec(`set local role authenticated; set local test.company='${other}'`);
  await assert.rejects(()=>save(graph,[],stamp),/non accessibile/);
});
await test('anonymous save is rejected',async()=>{
  await db.exec("set local test.uid=''"); await assert.rejects(()=>save(),/Autenticazione/);
});
await test('publication records one snapshot for the new version',async()=>{
  await save(); await db.query("update automation_flows set status='published',version=version+1 where id=$1",[flow]);
  assert.equal((await one('select count(*)::int as n from automation_flow_versions')).n,3);
});
await test('equal-sized tag replacement emits added, removed and updated',async()=>{
  await db.exec("update marketing_contacts set tags=array['new']");
  const events=(await db.query('select trigger_event,payload from automation_trigger_events')).rows;
  assert.deepEqual(events.map(e=>e.trigger_event).sort(),['contact_updated','tag_added','tag_removed']);
  assert.deepEqual(events.find(e=>e.trigger_event==='tag_removed').payload.removed_tags,['old']);
});
await test('removing last tag is not lost',async()=>{
  await db.exec("update marketing_contacts set tags='{}'");
  assert.deepEqual((await db.query('select trigger_event from automation_trigger_events order by trigger_event')).rows.map(r=>r.trigger_event),['contact_updated','tag_removed']);
});
await test('tag and assignee changes are independent',async()=>{
  await db.query("update marketing_contacts set tags=array['old','new'], assigned_to=$1",[entity]);
  assert.deepEqual((await db.query('select trigger_event from automation_trigger_events order by trigger_event')).rows.map(r=>r.trigger_event),['contact_assigned','contact_updated','tag_added']);
});
await test('frequent appointment job is staged inactive and does not change the daily job',async()=>{
  // Model the pg_cron API, not an actual scheduler: no command is ever executed.
  await db.exec(`create schema cron;
  create table cron.job(jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text, active boolean default true);
  create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
  create function cron.alter_job(job_id bigint, active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;`);
  const command="select net.http_post(url := 'https://invalid.example', headers := '{}'::jsonb, body := '{}'::jsonb)";
  await db.query('insert into cron.job(jobname,schedule,command) values($1,$2,$3)',['check-scheduled-triggers-daily','2 7 * * *',command]);
  const cadence=await readFile(new URL('../supabase/migrations/20260930175843_automation_appointment_trigger_cadence.sql',import.meta.url),'utf8');
  await db.exec(cadence); await db.exec(cadence);
  const jobs=(await db.query('select * from cron.job')).rows;
  assert.equal(jobs.length,2);
  const daily=jobs.find(j=>j.jobname==='check-scheduled-triggers-daily');
  assert.equal(daily.command,command); assert.equal(daily.schedule,'2 7 * * *'); assert.equal(daily.active,true);
  const frequent=jobs.find(j=>j.jobname==='automation-appointment-triggers');
  assert.equal(frequent.active,false); assert.equal(frequent.schedule,'*/5 * * * *');
  assert.match(frequent.command,/appointment_triggers_only/);
});
await db.close();
console.log(`${passed} isolated PostgreSQL checks passed; no network or production writes.`);
