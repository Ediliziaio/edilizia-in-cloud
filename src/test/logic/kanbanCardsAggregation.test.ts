import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';

const db=new PGlite();
const read=(path:string)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261015200408_kanban_richieste_aggregazione_unica.sql');
const a='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const c='cccccccc-cccc-4ccc-accc-cccccccccccc',o='dddddddd-dddd-4ddd-addd-dddddddddddd';
const o2='eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',other='ffffffff-ffff-4fff-afff-ffffffffffff';
beforeAll(async()=>{
  await db.exec(read('src/test/fixtures/mktMetricsSchema.sql'));
  await db.exec(read('src/test/fixtures/kanbanExtraSchema.sql'));
  await db.exec(read('src/test/fixtures/kanbanCardsBefore.sql'));
  // Ruolo senza BYPASSRLS: controlli sintetici su tutte le tabelle lette.
  await db.exec(`create role fixture_reader;grant usage on schema public to fixture_reader;
    grant select on all tables in schema public to fixture_reader;
    grant execute on all functions in schema public to fixture_reader;`);
  for(const table of ['marketing_opportunities','marketing_contacts','marketing_contact_activities','marketing_contact_notes','marketing_documents','appointments','tasks','profiles']){
    await db.exec(`alter table public.${table} enable row level security;
      create policy fixture_company on public.${table} for select to fixture_reader
      using(company_id=nullif(current_setting('test.company',true),'')::uuid);`);
  }
},60000);
afterEach(()=>db.exec('ROLLBACK'));
afterAll(()=>db.close());
const seed=`insert into marketing_contacts(id,company_id,first_name) values('${c}','${a}','Contatto fittizio');
  insert into marketing_opportunities(id,company_id,contact_id,name,deleted_at) values
    ('${o}','${a}','${c}','Scheda fittizia',null),('${o2}','${a}','${c}','Altra scheda',null),
    ('${other}','${b}','${c}','Non visibile',null);
  insert into marketing_contact_activities(company_id,contact_id,activity_type,created_at) values
    ('${a}','${c}','lead_form_submission',now()-interval '2 days'),
    ('${a}','${c}','lead_form_submission',now()),
    ('${a}','${c}','note_added',now()+interval '1 day'),
    ('${b}','${c}','lead_form_submission',now()+interval '3 days');`;
const scenarios=[
  {name:'richieste ripetute e altre opportunità',sql:''},
  {name:'nessuna richiesta',sql:'delete from marketing_contact_activities'},
  {name:'opportunità cancellata non conteggiata',sql:`update marketing_opportunities set deleted_at=now() where id='${o2}'`},
  {name:'contatto assente',sql:`update marketing_opportunities set contact_id=null`},
  {name:'agenda, note manuali e documenti invariati',sql:`insert into marketing_contact_notes(company_id,opportunity_id,automatica) values('${a}','${o}',false),('${a}','${o}',true);insert into marketing_documents(company_id,opportunity_id) values('${a}','${o}');insert into tasks(company_id,opportunity_id,status,due_date) values('${a}','${o}','aperta',current_date-1);insert into appointments(company_id,contact_id,appointment_date,status) values('${a}','${c}',current_date+1,'confermato');`},
];
async function snapshot(ids:string[]){
  return (await db.query<{cards:Array<Record<string,unknown>>}>('select opportunita_schede($1::uuid[]) as cards',[ids])).rows[0].cards;
}
describe('Kanban: aggregazione unica senza cambiare schede e isolamento',()=>{
  it.each(scenarios)('$name',async({sql})=>{
    await db.exec('BEGIN;'+seed+sql);
    await db.exec(`set local test.company='${a}';set local role fixture_reader`);
    const before=await snapshot([o2,other,o]);
    expect(before.map(card=>card.id)).toEqual([o2,o]);
    await db.exec('reset role;'+migration+`;set local role fixture_reader`);
    expect(await snapshot([o2,other,o])).toEqual(before);
    if(!sql){expect(before[1].richiesta_ripetuta).toMatchObject({richieste:2,altre_opportunita:1});}
  },30000);
  it('non restituisce schede con ID vuoti o appartenenti ad altra azienda',async()=>{
    await db.exec('BEGIN;'+seed+migration+`set local test.company='${a}';set local role fixture_reader`);
    expect(await snapshot([])).toEqual([]);
    expect(await snapshot([other])).toEqual([]);
  });
  it('riapplicabile senza modificare security invoker e ACL',async()=>{
    await db.exec('BEGIN;'+migration+migration);
    const properties=(await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where oid='opportunita_schede(uuid[])'::regprocedure")).rows[0];
    expect(properties.prosecdef).toBe(false);
  });
});
