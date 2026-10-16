import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const db = new PGlite();
const migration = readFileSync('supabase/migrations/20261015191111_cron_worker_coda_guardie.sql', 'utf8');
const emailMigration = readFileSync('supabase/migrations/20261015191543_cron_email_classificazione_solo_se_dovuta.sql', 'utf8');
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema cron; create table cron.job(jobid bigint,jobname text,command text,active boolean,schedule text);
    create function cron.alter_job(job_id bigint,command text) returns void language sql as $$update cron.job set command=$2 where jobid=$1$$;
    create table silvio_generation_jobs(status text,tipo text,updated_at timestamptz);
    create table silvio_outbound_messages(status text,claimed_at timestamptz);
    create table silvio_action_queue(status text,scheduled_for timestamptz,requires_approval boolean);
    create table social_posts(status text,scheduled_at timestamptz,next_attempt_at timestamptz);
    create table email_campaigns(status text,scheduled_at timestamptz,updated_at timestamptz);
    create table email_inbox(categoria text);
    create schema net; create table net.calls(n int);
    create function net.http_post() returns void language sql as $$insert into net.calls values(1)$$;
    insert into cron.job values(1,'silvio-action-runner','select public.silvio_invoke_edge();',true,'1-59/10 * * * *'),
      (2,'social-publish-scheduler','select net.http_post();',false,'*/5 * * * *'),
      (3,'unrelated-job','select 1',true,'* * * * *'),
      (4,'email-ai-l1-classify-2min','select net.http_post();',true,'2-59/5 * * * *'),
      (5,'email-ai-l3-batch-3min','select net.http_post();',true,'4-59/5 * * * *');
    BEGIN;${migration}${emailMigration}COMMIT;`);
}, 60000);
afterAll(() => db.close());
beforeEach(() => db.exec('truncate silvio_generation_jobs,silvio_outbound_messages,silvio_action_queue,social_posts,email_campaigns,email_inbox,net.calls'));
const due = async (name: string) => (await db.query<{due:boolean}>('select cron_worker_ha_lavoro($1) as due', [name])).rows[0].due;
describe('solo code dovute, senza perdere recupero e approvazioni', () => {
  it.each(['silvio-generation-worker-2min','silvio-outbound-worker-3min','silvio-action-runner','social-publish-scheduler','process-scheduled-campaigns'])('coda vuota: %s non fa HTTP', async name => expect(await due(name)).toBe(false));
  it.each(['image','video','document'])('risveglia immagini e tipi da chiudere: %s', async tipo => {
    await db.query("insert into silvio_generation_jobs values('queued',$1,now())", [tipo]);
    expect(await due('silvio-generation-worker-2min')).toBe(true);
  });
  it('non sveglia un generatore già in corso, recupera solo oltre 10 minuti', async () => {
    await db.exec("insert into silvio_generation_jobs values('processing','image',now())");
    expect(await due('silvio-generation-worker-2min')).toBe(false);
    await db.exec("update silvio_generation_jobs set updated_at=now()-interval '11 minutes'");
    expect(await due('silvio-generation-worker-2min')).toBe(true);
  });
  it('outbound: non interferisce col claim fresco, conserva recupero e candidati', async () => {
    await db.exec("insert into silvio_outbound_messages values('queued',now())");
    expect(await due('silvio-outbound-worker-3min')).toBe(false);
    await db.exec("update silvio_outbound_messages set claimed_at=now()-interval '11 minutes'");
    expect(await due('silvio-outbound-worker-3min')).toBe(true);
    await db.exec('update silvio_outbound_messages set claimed_at=null');
    expect(await due('silvio-outbound-worker-3min')).toBe(true);
  });
  it('azioni: né future né in attesa di approvazione; parte dopo approvazione', async () => {
    await db.exec("insert into silvio_action_queue values('queued',now(),true),('queued',now()+interval '1 day',false)");
    expect(await due('silvio-action-runner')).toBe(false);
    await db.exec('update silvio_action_queue set requires_approval=false');
    expect(await due('silvio-action-runner')).toBe(true);
  });
  it('social: futuro non parte, ripresa processing scaduta sì', async () => {
    await db.exec("insert into social_posts values('scheduled',now()+interval '1 day',null)");
    expect(await due('social-publish-scheduler')).toBe(false);
    await db.exec("insert into social_posts values('processing',null,now()-interval '1 minute')");
    expect(await due('social-publish-scheduler')).toBe(true);
  });
  it('social: post arrivato alla data parte, pubblicato no', async () => {
    await db.exec("insert into social_posts values('published',now(),null)");
    expect(await due('social-publish-scheduler')).toBe(false);
    await db.exec("update social_posts set status='scheduled'");
    expect(await due('social-publish-scheduler')).toBe(true);
  });
  it('email: futuro e invio fresco no; recupero invio bloccato sì', async () => {
    await db.exec("insert into email_campaigns values('scheduled',now()+interval '1 day',now()),('sending',now(),now())");
    expect(await due('process-scheduled-campaigns')).toBe(false);
    await db.exec("update email_campaigns set updated_at=now()-interval '61 minutes' where status='sending'");
    expect(await due('process-scheduled-campaigns')).toBe(true);
  });
  it('email: conserva anche la pulizia delle campagne troppo vecchie', async () => {
    await db.exec("insert into email_campaigns values('scheduled',now()-interval '2 days',now())");
    expect(await due('process-scheduled-campaigns')).toBe(true);
  });
  it('preserva cadenze, job spenti, comandi fuori ambito ed è idempotente', async () => {
    const before = (await db.query('select * from cron.job order by jobid')).rows;
    await db.exec(`BEGIN;${migration}${emailMigration}COMMIT;`);
    expect((await db.query('select * from cron.job order by jobid')).rows).toEqual(before);
    expect(before[0]).toMatchObject({active:true,schedule:'1-59/10 * * * *'});
    expect(before[1]).toMatchObject({active:false,command:'select net.http_post();'});
    expect(before[2].command).toBe('select 1');
  });
  it('non espone le code al client', async () => {
    expect((await db.query("select has_function_privilege('anon','cron_worker_ha_lavoro(text)','execute') as allowed union all select has_function_privilege('authenticated','cron_worker_ha_lavoro(text)','execute')")).rows).toEqual([{allowed:false},{allowed:false}]);
  });
  it('un nome sconosciuto fallisce esplicitamente', async () => {
    await expect(due('sconosciuto')).rejects.toThrow('Job non gestito');
  });
  it.each(['email-ai-l1-classify-2min','email-ai-l3-batch-3min'])('classificazione %s: nessun HTTP vuoto; la prima email nuova sveglia il worker', async job => {
    const command = (await db.query<{command:string}>('select command from cron.job where jobname=$1', [job])).rows[0].command;
    await db.exec(command);
    expect((await db.query('select * from net.calls')).rows).toHaveLength(0);
    await db.exec("insert into email_inbox values('cliente')");
    await db.exec(command);
    expect((await db.query('select * from net.calls')).rows).toHaveLength(0);
    await db.exec('insert into email_inbox values(null)');
    await db.exec(command);
    expect((await db.query('select * from net.calls')).rows).toHaveLength(1);
  });
});
