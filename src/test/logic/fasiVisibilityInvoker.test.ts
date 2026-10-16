import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261015194028_fasi_controllo_visibilita_invoker.sql','utf8');
const uid='11111111-1111-4111-a111-111111111111';
const order1='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const order2='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const order3='cccccccc-cccc-4ccc-accc-cccccccccccc';
const cases=[
  {company:1,view:'on',edit:'off',assigned:'off',blocked:'off'},
  {company:1,view:'off',edit:'on',assigned:'off',blocked:'off'},
  {company:1,view:'off',edit:'off',assigned:'off',blocked:'off'},
  {company:2,view:'on',edit:'on',assigned:'off',blocked:'off'},
  {company:1,view:'on',edit:'on',assigned:'on',blocked:'off'},
  {company:1,view:'on',edit:'on',assigned:'off',blocked:'on'},
];
type Scenario=typeof cases[number];
const configure=async(s:Scenario)=>db.exec(`set role authenticated;set test.company='${s.company}';set test.view='${s.view}';set test.edit='${s.edit}';set test.assigned='${s.assigned}';set test.blocked='${s.blocked}'`);
const originalRows:unknown[]=[];
beforeAll(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select '${uid}'::uuid$$;
    create table orders(id uuid primary key,company_id int,assigned_to uuid,destination_warehouse_id uuid,visible boolean);
    insert into orders values('${order1}',1,'${uid}',null,true),('${order2}',1,null,null,false),('${order3}',2,null,null,true);
    create function can_see_order(uuid,uuid,uuid) returns boolean language sql stable as $$select current_setting('test.assigned')='off' OR $2=auth.uid()$$;
    alter table orders enable row level security;
    create policy order_visibility on orders for select to authenticated using(company_id=current_setting('test.company')::int AND visible AND can_see_order(id,assigned_to,destination_warehouse_id));
    create table order_work_phases(id int primary key,company_id int,order_id uuid);
    insert into order_work_phases values(1,1,'${order1}'),(2,1,'${order2}'),(3,2,'${order3}');
    alter table order_work_phases enable row level security;
    grant usage on schema auth to authenticated;grant select on orders to authenticated;grant select,update,insert on order_work_phases to authenticated;
    create policy order_work_phases_lettura_public on order_work_phases for select to authenticated using(
      current_setting('test.view')='on' AND company_id=current_setting('test.company')::int
      AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_work_phases.order_id));
    create policy "Staff can manage order work phases if permitted" on order_work_phases for all to authenticated using(
      current_setting('test.edit')='on' AND company_id=current_setting('test.company')::int
      AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_work_phases.order_id AND can_see_order(o.id,o.assigned_to,o.destination_warehouse_id)))
      with check(current_setting('test.edit')='on' AND company_id=current_setting('test.company')::int
      AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_work_phases.order_id AND can_see_order(o.id,o.assigned_to,o.destination_warehouse_id)));
    create policy blocked on order_work_phases as restrictive for all to authenticated using(current_setting('test.blocked')='off');`);
  for(const scenario of cases){
    await configure(scenario);originalRows.push((await db.query('select id from order_work_phases order by id')).rows);await db.exec('reset role');
  }
  await db.exec(`BEGIN;${migration}COMMIT;`);
},60000);
afterEach(()=>db.exec('reset role'));
afterAll(()=>db.close());
describe('visibilità fasi invariata, senza bypass RLS',()=>{
  it.each(cases.map((scenario,index)=>({scenario,index})))('conserva le righe del contesto $index',async({scenario,index})=>{
    await configure(scenario);
    expect((await db.query('select id from order_work_phases order by id')).rows).toEqual(originalRows[index]);
  });
  it('helper invoker non legge una commessa nascosta o di altra azienda',async()=>{
    await configure(cases[0]);
    expect((await db.query('select public._order_visible_under_rls($1,false) as visible',[order1])).rows).toEqual([{visible:true}]);
    for(const id of [order2,order3])expect((await db.query('select public._order_visible_under_rls($1,false) as visible',[id])).rows).toEqual([{visible:false}]);
  });
  it('WITH CHECK continua a impedire lo spostamento cross-tenant e su ordine nascosto',async()=>{
    await configure({...cases[0],edit:'on'});
    await expect(db.query('update order_work_phases set company_id=2,order_id=$1 where id=1',[order3])).rejects.toThrow('row-level security');
    await expect(db.query('update order_work_phases set order_id=$1 where id=1',[order2])).rejects.toThrow('row-level security');
  });
  it('la funzione non è SECURITY DEFINER e il piano esterno non riespande orders',async()=>{
    expect((await db.query("select prosecdef from pg_proc where proname='_order_visible_under_rls'")).rows).toEqual([{prosecdef:false}]);
    await configure(cases[0]);
    const plan=JSON.stringify((await db.query('explain (format json) select * from order_work_phases')).rows);
    expect(plan).toContain('_order_visible_under_rls');
    expect(plan).not.toContain('"Relation Name":"orders"');
  });
  it('la migrazione è idempotente e mantiene ruoli e policy restrittive',async()=>{
    const before=(await db.query("select policyname,roles,qual,with_check from pg_policies where tablename='order_work_phases' order by policyname")).rows;
    await db.exec(`BEGIN;${migration}COMMIT;`);
    expect((await db.query("select policyname,roles,qual,with_check from pg_policies where tablename='order_work_phases' order by policyname")).rows).toEqual(before);
  });
});
