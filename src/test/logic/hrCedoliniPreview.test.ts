import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const extension = readFileSync('supabase/migrations/20260506093500_cedolini_presenze_auto.sql', 'utf8');
const foundation = readFileSync('supabase/migrations/20260916000015_create_hr_cedolini.sql', 'utf8');
const company = '10000000-0000-4000-8000-000000000001';
const otherCompany = '10000000-0000-4000-8000-000000000002';
const employee = '10000000-0000-4000-8000-000000000003';
const user = '10000000-0000-4000-8000-000000000004';

async function database() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create role anon; create role authenticated; create role service_role;
    create type app_role as enum ('company_admin','super_admin');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
    create function public.get_my_company_id() returns uuid language sql stable as $$select null::uuid$$;
    create table auth.users(id uuid primary key);
    create table companies(id uuid primary key);
    create table employees(id uuid primary key,company_id uuid,user_id uuid);
    create table profiles(id uuid,company_id uuid);
    insert into companies values ('${company}'),('${otherCompany}');
    insert into auth.users values ('${user}');
    insert into employees values ('${employee}','${company}','${user}');
  `);
  return db;
}

it('replays the complete historical HR migrations on an empty preview and keeps RLS and service-only RPCs', async () => {
  const db = await database();
  try {
    await db.exec(extension);
    expect((await db.query("select to_regclass('public.hr_cedolini') as name")).rows).toEqual([{ name: null }]);
    await db.exec(foundation);
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='hr_cedolini'");
    expect(columns.rows.map(c => c.column_name)).toEqual(expect.arrayContaining([
      'generation_method', 'validation_warnings', 'ore_ordinarie', 'consulente_user_id', 'ai_confidence',
    ]));
    expect((await db.query("select indexname from pg_indexes where indexname='idx_cedolini_pending_review'")).rows).toHaveLength(1);
    expect((await db.query("select relrowsecurity from pg_class where oid='public.hr_cedolini'::regclass")).rows).toEqual([{ relrowsecurity: true }]);
    expect((await db.query("select has_function_privilege('authenticated','public.silvio_tool_genera_cedolino_dipendente(uuid,uuid,uuid,int,int,boolean)','execute') as client, has_function_privilege('service_role','public.silvio_tool_genera_cedolino_dipendente(uuid,uuid,uuid,int,int,boolean)','execute') as service")).rows).toEqual([{ client: false, service: true }]);
    await db.exec(`insert into hr_cedolini(company_id,employee_id,anno,mese,netto) values ('${company}','${employee}',2026,10,1700);
      grant usage on schema public,auth to authenticated;
      grant select on hr_cedolini,employees,profiles to authenticated;
      select set_config('request.jwt.claim.sub','${user}',false);
      set role authenticated;`);
    expect((await db.query('select netto from hr_cedolini')).rows).toEqual([{ netto: '1700.00' }]);
    await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false)");
    expect((await db.query('select netto from hr_cedolini')).rows).toEqual([]);
  } finally { await db.close(); }
}, 30000);

it('reapplies safely on an existing database without losing payroll rows, policies or triggers', async () => {
  const db = await database();
  try {
    await db.exec(foundation);
    await db.exec(`insert into hr_cedolini(company_id,employee_id,anno,mese,netto) values ('${company}','${employee}',2026,10,1700)`);
    await db.exec(extension);
    await db.exec(foundation);
    await db.exec(extension);
    expect((await db.query('select netto,generation_method from hr_cedolini')).rows).toEqual([{ netto: '1700.00', generation_method: 'manual' }]);
    expect((await db.query("select policyname from pg_policies where tablename='hr_cedolini'")).rows).toHaveLength(2);
    expect((await db.query("select tgname from pg_trigger where tgrelid='public.hr_cedolini'::regclass and not tgisinternal")).rows).toEqual([{ tgname: 'trg_hr_cedolini_updated_at' }]);
    await expect(db.exec(`insert into hr_cedolini(company_id,employee_id,anno,mese,generation_method) values ('${company}','${employee}',2026,11,'invalid')`)).rejects.toMatchObject({ code: '23514' });
    await expect(db.exec(`insert into hr_cedolini(company_id,employee_id,anno,mese) values ('${company}','${employee}',2026,10)`)).rejects.toMatchObject({ code: '23505' });
  } finally { await db.close(); }
}, 30000);
