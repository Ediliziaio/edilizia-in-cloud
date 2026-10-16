import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261015185851_fasi_permessi_initplan.sql','utf8');
beforeAll(async()=>{
  await db.exec(`create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select '11111111-1111-4111-a111-111111111111'::uuid$$;
    create function has_permission(uuid,text) returns boolean language sql stable as $$select current_setting(case when $2='can_edit_orders' then 'test.edit' else 'test.view' end,true)='on'$$;
    create table order_work_phases(id int,company_id int);insert into order_work_phases values(1,1),(2,2);
    alter table order_work_phases enable row level security;
    grant usage on schema public,auth to authenticated;grant select,insert,update on order_work_phases to authenticated;
    create policy "Staff can manage order work phases if permitted" on order_work_phases for all to authenticated
      using(has_permission((select auth.uid()),'can_edit_orders') and company_id=current_setting('test.company')::int)
      with check(has_permission((select auth.uid()),'can_edit_orders') and company_id=current_setting('test.company')::int);
    create policy order_work_phases_lettura_public on order_work_phases for select to authenticated
      using(has_permission((select auth.uid()),'can_view_orders') and company_id=current_setting('test.company')::int);
    BEGIN;${migration}COMMIT;`);
},60000);
afterAll(()=>db.close());
describe('permessi fase invariati, controllo utente in InitPlan',()=>{
  it.each(['1','2'])('legge solo la propria azienda %s',async company=>{
    await db.exec(`set role authenticated;set test.company='${company}';set test.view='on';set test.edit='off';`);
    expect((await db.query('select id from order_work_phases')).rows).toEqual([{id:Number(company)}]);
    await db.exec('reset role');
  });
  it('non autorizza chi non ha permessi',async()=>{
    await db.exec("set role authenticated;set test.company='1';set test.view='off';set test.edit='off'");
    expect((await db.query('select id from order_work_phases')).rows).toEqual([]);
    await db.exec('reset role');
  });
  it('conserva WITH CHECK: edit non permette spostamenti cross-tenant',async()=>{
    await db.exec("set role authenticated;set test.company='1';set test.view='on';set test.edit='on'");
    await expect(db.exec('update order_work_phases set company_id=2 where id=1')).rejects.toThrow('row-level security');
    await db.exec('reset role');
  });
  it('il piano prepara il permesso come InitPlan',async()=>{
    await db.exec("set role authenticated;set test.company='1';set test.view='on';set test.edit='off'");
    const plan=await db.query('explain (format json) select * from order_work_phases');
    expect(JSON.stringify(plan.rows)).toContain('InitPlan');
    await db.exec('reset role');
  });
});
