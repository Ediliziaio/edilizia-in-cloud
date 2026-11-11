import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,beforeEach,it,expect } from 'vitest';
let db:PGlite;
const co='00000000-0000-4000-a000-000000000001',other='00000000-0000-4000-a000-000000000002',record='00000000-0000-4000-a000-000000000003',field='00000000-0000-4000-a000-000000000004',enr='00000000-0000-4000-a000-000000000005',flow='00000000-0000-4000-a000-000000000006';
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create function public.utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
 create table marketing_contacts(id uuid primary key,company_id uuid);
 create table marketing_opportunities(id uuid primary key,company_id uuid);
 create table appointments(id uuid primary key,company_id uuid);
 create table marketing_custom_fields(id uuid primary key,company_id uuid,object_type text,field_type text,deleted_at timestamptz,is_required boolean default false,name text,options text[]);
 create table marketing_contact_field_values(contact_id uuid,field_id uuid,value text,unique(contact_id,field_id));
 create table marketing_opportunity_field_values(opportunity_id uuid,field_id uuid,value text,unique(opportunity_id,field_id));
 create table entity_custom_field_values(company_id uuid,entity_type text,entity_id uuid,field_id uuid,value text,unique(entity_type,entity_id,field_id));
 create table automation_enrollments(id uuid primary key,flow_id uuid,company_id uuid,entity_type text constraint automation_enrollments_entity_type_check check(entity_type in ('contact','opportunity','appointment')));
 create table automation_trigger_events(id uuid default gen_random_uuid(),company_id uuid,trigger_event text,entity_type text,entity_id text,payload jsonb);
 grant usage on schema public,auth to service_role;grant all on all tables in schema public to service_role;`);
 const original=readFileSync('supabase/migrations/20281026160000_campi_personalizzati_validazione_alias.sql','utf8');
 await db.exec(original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.cf_target'),original.indexOf('CREATE OR REPLACE FUNCTION public.cf_can_access')));
 const validator=readFileSync('supabase/migrations/20281026160100_campi_personalizzati_sola_lettura_crm.sql','utf8');
 await db.exec(validator.slice(validator.indexOf('CREATE OR REPLACE FUNCTION'),validator.indexOf('REVOKE ALL')));
 await db.exec(`create trigger cf_validate before insert or update on marketing_contact_field_values for each row execute function cf_validate_value();create trigger cf_validate before insert or update on marketing_opportunity_field_values for each row execute function cf_validate_value();create trigger cf_validate before insert or update on entity_custom_field_values for each row execute function cf_validate_value();`);
 await db.exec(readFileSync('supabase/migrations/20290311150000_automation_custom_fields_contract.sql','utf8'));
},60000);
beforeEach(async()=>{await db.exec(`reset role;truncate marketing_contacts,marketing_opportunities,appointments,marketing_custom_fields,marketing_contact_field_values,marketing_opportunity_field_values,entity_custom_field_values,automation_enrollments,automation_trigger_events;
 insert into marketing_contacts values('${record}','${co}');insert into marketing_custom_fields(id,company_id,object_type,field_type,name) values('${field}','${co}','contact','date','Data');insert into automation_enrollments values('${enr}','${flow}','${co}','contact');set role service_role;`)});
afterAll(async()=>{await db?.close()});
const write=(v:string|null='2026-11-11',company=co,path:unknown=[])=>db.query('select automation_write_custom_field($1,$2,$3,$4,$5,$6,$7::jsonb)',[company,'contact',record,field,v,enr,JSON.stringify(path)]);
it('commits a valid value and one event with the originating flow; identical retries do not emit',async()=>{
 await write();await write();const result=await db.query<{payload:any}>('select payload from automation_trigger_events');expect(result.rows).toHaveLength(1);expect(result.rows[0].payload).toMatchObject({new_value:'2026-11-11',old_value:null,custom_field_id:field,custom_field_flow_path:[flow]});
 await write('2026-11-12');expect((await db.query('select * from automation_trigger_events')).rows).toHaveLength(2);
});
it('rejects invalid dates atomically without values or events',async()=>{await expect(write('2026-02-30')).rejects.toThrow();expect((await db.query('select * from marketing_contact_field_values')).rows).toHaveLength(0);expect((await db.query('select * from automation_trigger_events')).rows).toHaveLength(0)});
it('rejects another company and enrollment before writing',async()=>{await expect(write('2026-11-11',other)).rejects.toThrow(/azienda/);await db.exec(`reset role;update automation_enrollments set company_id='${other}';set role service_role;`);await expect(write()).rejects.toThrow(/Iscrizione/)});
it('rejects deleted definitions and wrong object types',async()=>{await db.exec(`reset role;update marketing_custom_fields set object_type='opportunity';set role service_role;`);await expect(write()).rejects.toThrow(/campo/);});
it('limits event chains and appends the current flow only once',async()=>{await write('2026-11-11',co,[flow]);expect((await db.query<{payload:any}>('select payload from automation_trigger_events')).rows[0].payload.custom_field_flow_path).toEqual([flow]);await expect(write('2026-11-12',co,Array(32).fill(flow))).rejects.toThrow(/Catena/);});
it('does not grant the worker RPC or capability to browser roles',async()=>{await db.exec('reset role;set role authenticated;');await expect(write()).rejects.toThrow(/permission denied/);await expect(db.query('select automation_custom_fields_version()')).rejects.toThrow(/permission denied/);});
it('also emits from an ordinary UI write and from clearing a value',async()=>{await db.exec(`insert into marketing_contact_field_values values('${record}','${field}','2026-11-11')`);await write(null);expect((await db.query('select * from automation_trigger_events')).rows).toHaveLength(2)});
it('routes opportunity and other supported object values into their own tables',async()=>{
 await db.exec(`reset role;update marketing_custom_fields set object_type='opportunity';insert into marketing_opportunities values('${record}','${co}');set role service_role;`);
 await db.query('select automation_write_custom_field($1,\'opportunity\',$2,$3,\'2026-11-11\')',[co,record,field]);
 await db.exec(`reset role;update marketing_custom_fields set object_type='appointment';insert into appointments values('${record}','${co}');set role service_role;`);
 await db.query('select automation_write_custom_field($1,\'appointment\',$2,$3,\'2026-11-12\')',[co,record,field]);
 expect((await db.query('select * from marketing_opportunity_field_values')).rows).toHaveLength(1);expect((await db.query('select * from entity_custom_field_values')).rows).toHaveLength(1);
});

it.each([['email','team@example.com',true],['email','invalid@address',false],['number','12,5',true],['percent','101',false],['checkbox','yes',false],['checkbox','true',true],['file','anything',false],['date','2026-11-11T00:00:00Z',false]])('validates custom type %s with value %s',async(type,value,valid)=>{
 await db.exec(`reset role;update marketing_custom_fields set field_type='${type}';set role service_role;`);
 if(valid){await write(value);expect((await db.query('select * from automation_trigger_events')).rows).toHaveLength(1);}else{await expect(write(value)).rejects.toThrow();expect((await db.query('select * from automation_trigger_events')).rows).toHaveLength(0);}
});
