import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
const db=new PGlite();
const read=(name:string)=>readFileSync(name,'utf8');
const migration=read('supabase/migrations/20261015200024_mkt_cte_valutazione_unica.sql');
beforeAll(async()=>{
  await db.exec(read('src/test/fixtures/mktMetricsSchema.sql'));
  await db.exec(read('src/test/fixtures/mktMinutesBefore.sql'));
  await db.exec(read('src/test/fixtures/mktMetricsBefore.sql'));
},60000);
afterEach(()=>db.exec('ROLLBACK'));
afterAll(()=>db.close());
const a='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',line='cccccccc-cccc-4ccc-accc-cccccccccccc';
const contact='dddddddd-dddd-4ddd-addd-dddddddddddd',opp='eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
const seed=`insert into aedix_product_lines(id,categoria) values('${line}','agenzia');
  insert into aedix_service_clients(id,company_id,product_line_id,stato,data_inizio,mkt_settore,mkt_budget_mensile)
    values('${a}','${a}','${line}','attivo',current_date-100,'altro',1000),('${b}','${b}','${line}','attivo',current_date-15,'altro',500);
  insert into mkt_settori_benchmark(settore,appuntamento_min,appuntamento_max) values('altro',0.1,0.5);
  insert into marketing_contacts(id,company_id,created_at,phone,source,source_channel)
    values('${contact}','${a}',now()-interval '3 days','123456789','meta','lead');
  insert into marketing_opportunities(id,company_id,contact_id,status,value,created_at,updated_at,deleted_at)
    values('${opp}','${a}','${contact}','open',1000,now()-interval '3 days',now(),null);
  insert into mkt_spesa_giornaliera(company_id,giorno,spesa,lead_dichiarati,sincronizzato_il)
    values('${a}',current_date-1,200,3,now());`;
const scenarios=[
  {name:'nessun cliente marketing',sql:'',seed:false},
  {name:'due aziende, una con attività e una vuota',sql:'',seed:true},
  {name:'cliente in pausa e spesa senza lead',sql:`update aedix_service_clients set stato='pausa' where id='${a}';delete from marketing_contacts;`,seed:true},
  {name:'vendita, sopralluogo e preventivo sospeso',sql:`update marketing_opportunities set status='won',won_at=now()-interval '1 day';insert into appointments(id,company_id,opportunity_id,contact_id,created_at,appointment_date,status,is_completed,is_blocked_slot) values('${opp}','${a}','${opp}','${contact}',now()-interval '2 days',current_date-2,'completato',true,false);insert into quotes(id,company_id,opportunity_id,contact_id,status,created_at,sent_at) values('${opp}','${a}','${opp}','${contact}','inviata',now()-interval '12 days',now()-interval '12 days');`,seed:true},
  {name:'orario personalizzato e dati senza spesa',sql:`update aedix_service_clients set mkt_orario_servizio='{"lun_ven":["09:00","12:00"],"sab":null,"dom":null}';delete from mkt_spesa_giornaliera;`,seed:true},
  {name:'attività di primo contatto e note',sql:`insert into marketing_contact_activities(id,company_id,contact_id,activity_type,created_at) values('${opp}','${a}','${contact}','note_added',now()-interval '2 days');`,seed:true},
];
describe('metriche marketing identiche prima/dopo la materializzazione',()=>{
  it.each(scenarios)('$name',async scenario=>{
    await db.exec('BEGIN');if(scenario.seed)await db.exec(seed);if(scenario.sql)await db.exec(scenario.sql);
    const beforeCount=(await db.query('select mkt_calcola_metriche(current_date) as n')).rows;
    const before=(await db.query('select to_jsonb(m) as metrics from mkt_metriche_giorno m order by service_client_id')).rows;
    await db.exec(migration);
    await db.exec('truncate mkt_metriche_giorno');
    expect((await db.query('select mkt_calcola_metriche(current_date) as n')).rows).toEqual(beforeCount);
    expect((await db.query('select to_jsonb(m) as metrics from mkt_metriche_giorno m order by service_client_id')).rows).toEqual(before);
  },30000);
  it('mantiene l’autorizzazione e i cinque CTE senza riapplicazioni distruttive',async()=>{
    await db.exec('BEGIN;'+migration+migration);
    const definition=(await db.query<{definition:string}>("select pg_get_functiondef('mkt_calcola_metriche(date)'::regprocedure) as definition")).rows[0].definition;
    expect((definition.match(/AS MATERIALIZED/g)??[])).toHaveLength(5);
    expect(definition).toContain("IF auth.uid() IS NOT NULL AND NOT public.is_super_admin()");
    await db.exec("set test.uid='11111111-1111-4111-a111-111111111111';set test.super='off'");
    await expect(db.query('select mkt_calcola_metriche(current_date)')).rejects.toThrow('non autorizzato');
  });
});
