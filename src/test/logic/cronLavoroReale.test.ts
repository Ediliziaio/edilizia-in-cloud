import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
const db=new PGlite();
const migration=readFileSync("supabase/migrations/20261015185850_cron_evitalavoro_vuoto.sql","utf8");
beforeAll(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema cron;
    create table cron.job(jobid bigint,jobname text,command text,active boolean,schedule text);
    create function cron.alter_job(job_id bigint,command text) returns void language sql as $$update cron.job set command=$2 where jobid=$1$$;
    create table automation_queue(flow_id int,company_id int,status text,execute_at timestamptz);
    create table automation_flows(id int,company_id int,status text,deleted_at timestamptz);
    create table integration_webhook_events(status text);
    create table automation_trigger_events(processed boolean);
    create table ai_campaigns_v2(id int,tipo text,stato text,data_fine timestamptz);
    create table ai_campaign_contacts(campaign_id int,stato text,ultimo_tentativo_il timestamptz);
    create table platform_settings(key text,value text);
    create table bulk_due(id int);create function bulk_scheduler_due_flows() returns setof bulk_due language sql stable set search_path=public as $$select * from bulk_due$$;
    insert into cron.job values(1,'voice-campaign-dispatch','select net.http_post();',true,'* * * * *'),
      (2,'meta-process-leads-queue','select net.http_post();',false,'*/2 * * * *'),
      (3,'unrelated-job','select 1',true,'* * * * *');
    BEGIN;${migration}COMMIT;`);
},60000);
afterAll(()=>db.close());
beforeEach(()=>db.exec("truncate automation_queue,automation_flows,integration_webhook_events,automation_trigger_events,ai_campaigns_v2,ai_campaign_contacts,platform_settings,bulk_due"));
const due=async(name:string)=>(await db.query<{due:boolean}>("select cron_ha_lavoro($1) as due",[name])).rows[0].due;
describe("il cron non sveglia worker senza lavoro",()=>{
  it("nessuna campagna: niente worker vocale",async()=>expect(await due('voice-campaign-dispatch')).toBe(false));
  it("una campagna in pausa non viene riattivata",async()=>{
    await db.exec("insert into ai_campaigns_v2 values(1,'chiamata','pausa',null);insert into ai_campaign_contacts values(1,'in_coda',null)");
    expect(await due('voice-campaign-dispatch')).toBe(false);
  });
  it("campagna attiva con destinatario sveglia il claim, senza chiamare un contatto nel test",async()=>{
    await db.exec("insert into ai_campaigns_v2 values(1,'chiamata','in_corso',null);insert into ai_campaign_contacts values(1,'in_coda',null)");
    expect(await due('voice-campaign-dispatch')).toBe(true);
  });
  it("conserva il recupero dei tentativi incerti vecchi",async()=>{
    await db.exec("insert into ai_campaign_contacts values(1,'prenotata',now()-interval '80 minutes')");
    expect(await due('voice-campaign-dispatch')).toBe(true);
  });
  it.each([null,'false','TRUE'])("richiamo a caldo con flag %s",async value=>{
    if(value!==null)await db.query("insert into platform_settings values('richiamo_a_caldo_attivo',$1)",[value]);
    expect(await due('ai-voice-outbound-leads')).toBe(value==='TRUE');
  });
  it("automazioni future, bozza e altra azienda non svegliano il worker",async()=>{
    await db.exec("insert into automation_flows values(1,1,'published',null),(2,1,'draft',null);insert into automation_queue values(1,1,'pending',now()+interval '1 day'),(2,1,'pending',now()),(1,2,'pending',now())");
    expect(await due('process-automation-queue')).toBe(false);
    await db.exec("insert into automation_queue values(1,1,'pending',now())");
    expect(await due('process-automation-queue')).toBe(true);
  });
  it("Meta: il primo evento pending sveglia il worker",async()=>{
    expect(await due('meta-process-leads-queue')).toBe(false);
    await db.exec("insert into integration_webhook_events values('pending')");
    expect(await due('meta-process-leads-queue')).toBe(true);
  });
  it("un evento di trigger sveglia il motore anche con la coda passi vuota",async()=>{
    await db.exec('insert into automation_trigger_events values(false)');
    expect(await due('process-automation-queue')).toBe(true);
  });
  it("un'attesa scaduta deve avanzare anche senza nuovi lead",async()=>{
    await db.exec("insert into automation_flows values(1,1,'published',null);insert into automation_queue values(1,1,'waiting',now())");
    expect(await due('process-automation-queue')).toBe(true);
  });
  it("eventi già elaborati non generano altri giri",async()=>{
    await db.exec('insert into automation_trigger_events values(true)');
    expect(await due('process-automation-queue')).toBe(false);
  });
  it("bulk: solo flussi pubblicati e dovuti restituiti dalla RPC esistente",async()=>{
    expect(await due('automation-bulk-scheduler-runner')).toBe(false);
    await db.exec("insert into bulk_due values(1)");expect(await due('automation-bulk-scheduler-runner')).toBe(true);
  });
  it("non altera cadenze, job spenti o job fuori ambito",async()=>{
    const {rows}=await db.query<{jobname:string;command:string;active:boolean;schedule:string}>('select jobname,command,active,schedule from cron.job order by jobid');
    expect(rows[0]).toMatchObject({active:true,schedule:'* * * * *'});expect(rows[0].command).toContain('cron_ha_lavoro');
    expect(rows[1]).toMatchObject({active:false,command:'select net.http_post();',schedule:'*/2 * * * *'});
    expect(rows[2].command).toBe('select 1');
  });
  it("non espone lo stato delle code ai client",async()=>{
    expect((await db.query("select has_function_privilege('authenticated','cron_ha_lavoro(text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
  });
});
