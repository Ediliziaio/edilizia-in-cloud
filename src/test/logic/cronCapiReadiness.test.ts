import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
const db = new PGlite();
const sql = readFileSync('supabase/migrations/20261015193014_cron_integrazioni_senza_destinazioni.sql','utf8');
beforeAll(async () => {
  await db.exec(`create schema cron;create schema net;
    create table cron.job(jobid bigint,jobname text,command text,active boolean,schedule text);
    create function cron.alter_job(job_id bigint,command text) returns void language sql as $$update cron.job set command=$2 where jobid=$1$$;
    create table meta_conversion_pixel(company_id int,is_active boolean,capi_token_encrypted text);
    create table meta_crm_conversion_events(company_id int,status text,attempt_count int);
    create table net.calls(n int);create function net.http_post() returns void language sql as $$insert into net.calls values(1)$$;
    insert into cron.job values(1,'meta-crm-conversion-sync-10min','select net.http_post();',true,'6-59/10 * * * *'),
      (2,'unrelated-job','select 1',true,'* * * * *');
    BEGIN;${sql}COMMIT;`);
},60000);
afterAll(() => db.close());
beforeEach(() => db.exec('truncate meta_conversion_pixel,meta_crm_conversion_events,net.calls'));
const run = async () => {
  const command = (await db.query<{command:string}>('select command from cron.job where jobid=1')).rows[0].command;
  await db.exec(command);
  return (await db.query('select * from net.calls')).rows.length;
};
describe('Meta CAPI solo con destinazione attiva e coda utile', () => {
  it('non sveglia il worker se manca il pixel, anche con eventi in coda', async () => {
    await db.exec("insert into meta_crm_conversion_events values(1,'pending',0)");
    expect(await run()).toBe(0);
  });
  it.each(["false,'encrypted'","true,null"])('pixel non utilizzabile: %s', async values => {
    await db.exec(`insert into meta_conversion_pixel values(1,${values});insert into meta_crm_conversion_events values(1,'pending',0)`);
    expect(await run()).toBe(0);
  });
  it('un pixel di altra azienda non abilita gli eventi', async () => {
    await db.exec("insert into meta_conversion_pixel values(2,true,'encrypted');insert into meta_crm_conversion_events values(1,'pending',0)");
    expect(await run()).toBe(0);
  });
  it.each(['pending','failed'])('destinazione attiva: risveglia %s senza cambiare gli eventi', async status => {
    await db.exec("insert into meta_conversion_pixel values(1,true,'encrypted')");
    await db.query('insert into meta_crm_conversion_events values(1,$1,null)',[status]);
    expect(await run()).toBe(1);
    expect((await db.query('select status from meta_crm_conversion_events')).rows).toEqual([{status}]);
  });
  it('non ritenta eventi completati o con cinque tentativi esauriti', async () => {
    await db.exec("insert into meta_conversion_pixel values(1,true,'encrypted');insert into meta_crm_conversion_events values(1,'sent',0),(1,'failed',5)");
    expect(await run()).toBe(0);
  });
  it('è idempotente e preserva gli altri job e la pianificazione', async () => {
    const before = (await db.query<{jobid:number;jobname:string;command:string;active:boolean;schedule:string}>('select * from cron.job order by jobid')).rows;
    await db.exec(`BEGIN;${sql}COMMIT;`);
    expect((await db.query<{jobid:number;jobname:string;command:string;active:boolean;schedule:string}>('select * from cron.job order by jobid')).rows).toEqual(before);
    expect(before[0]).toMatchObject({active:true,schedule:'6-59/10 * * * *'});
    expect(before[1].command).toBe('select 1');
  });
});
