import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const migration=(name:string)=>readFileSync('supabase/migrations/'+name,'utf8');
const one='00000000-0000-4000-a000-000000000001',two='00000000-0000-4000-a000-000000000002',user='00000000-0000-4000-a000-000000000003';
it('keeps company membership closed before the accountant module exists and recognizes it once installed',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create type app_role as enum('super_admin','company_admin');create schema auth;create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;create function has_role(uuid,app_role) returns boolean language sql as $$select false$$;create function get_user_company_id(uuid) returns uuid language sql as $$select '${one}'::uuid$$;create table multi_company_access(user_id uuid,company_id uuid);`);
  await db.exec(migration('20260711072411_security_helper_user_can_access_company.sql'));
  await db.exec(migration('20260711072552_security_helper_user_can_access_company_coalesce_fix.sql'));
  expect((await db.query<{allowed:boolean}>('select user_can_access_company($1) allowed',[two])).rows[0].allowed).toBe(false);
  expect((await db.query<{allowed:boolean}>('select user_can_access_company($1) allowed',[one])).rows[0].allowed).toBe(true);
  await db.exec(`create function can_accountant_access_company(uuid,text) returns boolean language sql as $$select $1='${two}'::uuid$$`);
  expect((await db.query<{allowed:boolean}>('select user_can_access_company($1) allowed',[two])).rows[0].allowed).toBe(true);
 }finally{await db.close()}
},60000);
it('enforces enrollment membership before course grants exist and after grant-aware policies are installed',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;create type app_role as enum('super_admin');create function has_role(uuid,app_role) returns boolean language sql as $$select false$$;create table profiles(id uuid,company_id uuid);insert into profiles values('${user}','${one}');create table multi_company_access(user_id uuid,company_id uuid);create table portal_courses(company_id uuid,id text);insert into portal_courses values('${one}','own'),('${two}','shared');create table portal_course_enrollments(company_id uuid,user_id uuid,course_id text);create table portal_course_activity(id uuid);alter table portal_course_enrollments enable row level security;grant usage on schema public,auth to authenticated;grant select on profiles,multi_company_access,portal_courses to authenticated;grant insert,select on portal_course_enrollments to authenticated;`);
  await db.exec(migration('20260710054955_portal_enrollments_tenant_guard.sql'));
  await db.exec(`set role authenticated;insert into portal_course_enrollments values('${one}','${user}','own');`);
  await expect(db.exec(`insert into portal_course_enrollments values('${two}','${user}','shared')`)).rejects.toThrow(/row-level security/);
  await db.exec(`reset role;create table portal_course_grants(target_company_id uuid,course_id text,status text);insert into portal_course_grants values('${one}','shared','granted');grant select on portal_course_grants to authenticated;`);
  const late=migration('20270527000000_portal_admin_grants.sql');await db.exec(late.slice(late.indexOf('-- Preserve the tenant hardening')));
  await db.exec(`set role authenticated;insert into portal_course_enrollments values('${one}','${user}','shared')`);
  await expect(db.exec(`insert into portal_course_enrollments values('${two}','${user}','shared')`)).rejects.toThrow(/row-level security/);
 }finally{await db.close()}
},60000);
it('preserves contact updates, tag replacement and assignment events when patching the known commented emitter',async()=>{
 const db=new PGlite();try{
  await db.exec(`create table marketing_contacts(id uuid primary key,company_id uuid,email text,phone text,source text,contact_type text,tags text[],assigned_to uuid,first_name text,last_name text,city text,address text,province text,region text,postal_code text,company_name text);create table automation_trigger_events(company_id uuid,trigger_event text,entity_id text,entity_type text,payload jsonb);`);
  const old=migration('20260715080241_automation_emitters_fix_filters_and_leave.sql');
  const def=old.match(/CREATE OR REPLACE FUNCTION public.fire_marketing_automation\(\)[\s\S]*?\$function\$;/i);expect(def).toBeTruthy();await db.exec(def![0]);await db.exec(migration('20260728160000_fix_fire_marketing_automation_array_append.sql'));
  const source=migration('20260930173612_automation_runtime_guards.sql');const patch=source.slice(source.indexOf('do $patch_tags$'));
  await db.exec(patch);await db.exec(patch);
  await db.exec(`create trigger events after insert or update on marketing_contacts for each row execute function fire_marketing_automation();insert into marketing_contacts(id,company_id,tags) values('${user}','${one}',array['old']);truncate automation_trigger_events;update marketing_contacts set tags=array['new'],assigned_to='${two}' where id='${user}'`);
  expect((await db.query<{trigger_event:string}>('select trigger_event from automation_trigger_events order by trigger_event')).rows.map(x=>x.trigger_event)).toEqual(['contact_assigned','contact_updated','tag_added','tag_removed']);
  const delta=(await db.query<{payload:{added_tags:string[];removed_tags:string[]}}>("select payload from automation_trigger_events where trigger_event='tag_added'")).rows[0].payload;expect(delta.added_tags).toEqual(['new']);expect(delta.removed_tags).toEqual(['old']);
 }finally{await db.close()}
},60000);
