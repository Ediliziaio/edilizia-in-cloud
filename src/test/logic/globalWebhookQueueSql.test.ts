import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
const co='10000000-0000-4000-a000-000000000001',other='10000000-0000-4000-a000-000000000002',admin='20000000-0000-4000-a000-000000000001',viewer='20000000-0000-4000-a000-000000000002',wh='30000000-0000-4000-a000-000000000001',record='40000000-0000-4000-a000-000000000001';
let db:PGlite;
const tables=['marketing_contacts','marketing_opportunities','orders','appointments','tasks','invoice_payments','bank_payments'];
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select $3='${co}' and ($1='${admin}' or $1='${viewer}' and $2='can_view_settings_integrations')$$;create function utente_sola_lettura(uuid) returns boolean language sql as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
 create table webhooks(id uuid primary key,company_id uuid,name text,url text,secret text,is_active boolean default true,events text[],created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),allowed_ips text[],timeout_seconds integer default 15,consecutive_failures integer default 0,max_consecutive_failures integer default 20,paused_at timestamptz,paused_reason text);
 create table webhook_deliveries(id uuid primary key default gen_random_uuid(),webhook_id uuid references webhooks(id) on delete cascade,event_type text,payload jsonb,status text default 'pending',http_status integer,response_body text,duration_ms integer,attempt_count integer default 1,last_attempt_at timestamptz default now(),created_at timestamptz default now());alter table webhooks enable row level security;alter table webhook_deliveries enable row level security;grant usage on schema public,auth to authenticated;grant all on webhooks,webhook_deliveries to authenticated;create policy receipts on webhook_deliveries for select to authenticated using(exists(select 1 from webhooks w where w.id=webhook_id));`);
 await db.exec('create table order_statuses(id uuid primary key,company_id uuid,name text,position integer,is_support_phase boolean default false)');
 for(const table of tables)await db.exec(`create table ${table}(id uuid primary key,company_id uuid,status text default 'open',stage_id uuid,current_status_id uuid,updated_at timestamptz,deleted_at timestamptz,first_name text,email text,notes text,appointment_date date,appointment_time time,due_date date,amount numeric)`);
 await db.exec(readFileSync('supabase/migrations/20290311180000_global_webhook_delivery_queue.sql','utf8'));
},60000);
beforeEach(async()=>{await db.exec(`reset role;set test.readonly='false';truncate ${tables.join(',')},webhooks,order_statuses cascade;insert into webhooks(id,company_id,name,url,secret,events) values('${wh}','${co}','App esterna','https://example.com','not-visible',array['contact.created','contact.updated','contact.deleted','opportunity.created','opportunity.updated','opportunity.stage_changed','opportunity.won','opportunity.lost','order.created','order.status_changed','order.completed','order.cancelled','appointment.created','appointment.rescheduled','appointment.completed','appointment.cancelled','task.created','task.completed','task.overdue','payment.received','payment.failed'])`)});
afterAll(async()=>{await db.close()});
const receipts=async()=> (await db.query<{event_type:string;event_id:string;payload:Record<string,unknown>;id:string;lease_token:string;attempt_count:number;status:string}>('select * from webhook_deliveries order by created_at,id')).rows;
const claim=async()=> (await db.query<{queue:Array<{id:string;lease_token:string;event_id:string}>}>('select claim_global_webhook_deliveries(20) as queue')).rows[0].queue;
it('queues selected tenant events atomically, ignores metadata-only updates and limits the payload',async()=>{
 await db.exec(`insert into marketing_contacts(id,company_id,first_name,notes) values('${record}','${co}','Ada','private notes');insert into marketing_contacts(id,company_id) values(gen_random_uuid(),'${other}');update marketing_contacts set updated_at=now();`);
 expect(await receipts()).toHaveLength(1);expect((await receipts())[0].payload).not.toHaveProperty('notes');
 await db.exec(`update marketing_contacts set first_name='Grace' where id='${record}';update marketing_contacts set deleted_at=now() where id='${record}'`);
 expect((await receipts()).map(x=>x.event_type).sort()).toEqual(['contact.created','contact.deleted','contact.updated']);
});
it('emits stage/state, rescheduling and bank failure events without guessing a failed payment from a negative amount',async()=>{
 await db.exec(`insert into marketing_opportunities(id,company_id) values('${record}','${co}');update marketing_opportunities set status='won',stage_id=gen_random_uuid();insert into orders(id,company_id) values('${record}','${co}');update orders set status='completed';insert into appointments(id,company_id,appointment_date,appointment_time) values('${record}','${co}','2026-11-12','09:00');update appointments set appointment_time='10:00';update appointments set status='cancelled';insert into invoice_payments(id,company_id,amount) values('${record}','${co}',50);insert into bank_payments(id,company_id,status) values('${record}','${co}','pending');update bank_payments set status='failed'`);
 const events=(await receipts()).map(x=>x.event_type);for(const e of ['opportunity.stage_changed','opportunity.won','order.status_changed','order.completed','appointment.rescheduled','appointment.cancelled','payment.received','payment.failed'])expect(events).toContain(e);
});
it('leases once, deduplicates an overdue deadline and preserves the logical event across retry',async()=>{
 await db.exec(`update webhooks set events=array['task.overdue'];insert into tasks(id,company_id,due_date) values('${record}','${co}',now()-interval '1 day')`);
 const first=await claim();expect(first).toHaveLength(1);expect(await claim()).toEqual([]);
 expect((await db.query<{ok:boolean}>(`select finish_global_webhook_delivery('${first[0].id}',gen_random_uuid(),true,200,2) as ok`)).rows[0].ok).toBe(false);
 await db.exec(`select finish_global_webhook_delivery('${first[0].id}','${first[0].lease_token}',false,503,10);update webhook_deliveries set next_attempt_at=now()-interval '1 minute'`);
 const retry=await claim();expect(retry).toHaveLength(1);expect(retry[0].event_id).toBe(first[0].event_id);
 await db.exec(`select finish_global_webhook_delivery('${retry[0].id}','${retry[0].lease_token}',true,200,1)`);expect(await claim()).toEqual([]);expect(await receipts()).toHaveLength(1);
});
it('pauses a failing endpoint and clears the breaker only on explicit reactivation',async()=>{
 await db.exec(`update webhooks set max_consecutive_failures=1;insert into marketing_contacts(id,company_id) values('${record}','${co}')`);const [row]=await claim();await db.exec(`select finish_global_webhook_delivery('${row.id}','${row.lease_token}',false,500,1)`);
 expect((await db.query<{is_active:boolean}>('select is_active from webhooks')).rows[0].is_active).toBe(false);expect(await claim()).toEqual([]);
 await db.exec('update webhooks set is_active=true');expect((await db.query<{consecutive_failures:number;paused_at:null}>('select consecutive_failures,paused_at from webhooks')).rows[0]).toEqual({consecutive_failures:0,paused_at:null});
});
it('denies queue functions and signing secret access to authenticated clients; viewers cannot subscribe or forge deliveries',async()=>{
 await db.exec(`set request.jwt.claim.sub='${viewer}';set role authenticated`);expect((await db.query('select id from webhooks')).rows).toHaveLength(1);
 await expect(db.exec('select secret from webhooks')).rejects.toThrow(/permission denied/);
 await expect(db.exec(`insert into webhooks(id,company_id,events) values(gen_random_uuid(),'${co}',array['contact.created'])`)).rejects.toThrow(/row-level security/);
 await expect(db.exec(`insert into webhook_deliveries(webhook_id,event_type) values('${wh}','contact.created')`)).rejects.toThrow(/permission denied/);
 await expect(db.exec('select claim_global_webhook_deliveries()')).rejects.toThrow(/permission denied/);
 await db.exec(`set request.jwt.claim.sub='${admin}';update webhooks set name='Renamed' where id='${wh}'`);expect((await db.query<{name:string}>('select name from webhooks')).rows[0].name).toBe('Renamed');
 await db.exec(`set test.readonly='true';update webhooks set name='Not allowed'`);expect((await db.query<{name:string}>('select name from webhooks')).rows[0].name).toBe('Renamed');
});

it('treats a task due today as current and recognizes the final custom order phase',async()=>{
 await db.exec(`update webhooks set events=array['task.overdue','order.completed'];insert into tasks(id,company_id,due_date) values('${record}','${co}',(now() at time zone 'Europe/Rome')::date)`);
 expect(await claim()).toEqual([]);
 const phase='50000000-0000-4000-a000-000000000001';
 await db.exec(`insert into order_statuses(id,company_id,name,position) values('${phase}','${co}','Consegna cliente',5);insert into orders(id,company_id) values('${record}','${co}');update orders set current_status_id='${phase}' where id='${record}'`);
 expect((await receipts()).map(x=>x.event_type)).toEqual(['order.completed']);
});

it('emits cancellation when an order still references its final custom phase',async()=>{
 const phase='50000000-0000-4000-a000-000000000001';
 await db.exec(`update webhooks set events=array['order.cancelled','order.completed'];insert into order_statuses(id,company_id,name,position) values('${phase}','${co}','Concluso',5);insert into orders(id,company_id,current_status_id) values('${record}','${co}','${phase}');truncate webhook_deliveries cascade;update orders set status='cancelled' where id='${record}'`);
 expect((await receipts()).map(x=>x.event_type)).toEqual(['order.cancelled']);
});
