import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const migration=readFileSync('supabase/migrations/20290506151000_cron_legacy_automazioni_ritirato.sql','utf8');
try {
  await db.exec(`create schema cron;create table cron.job(jobid bigint primary key,jobname text,command text);
    create function cron.unschedule(p bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=p;return found;end$$;
    create table internal_automation_flows(status text);create table internal_automation_queue(status text);
    insert into cron.job values(1,'process-internal-automation-queue','/functions/v1/process-internal-automation'),
      (2,'process-automation-queue','/functions/v1/process-automation'),
      (3,'process-internal-automation-queue','/functions/v1/process-internal-automation-v2');
    insert into internal_automation_flows values('published');`);
  await assert.rejects(db.exec(migration),/lavoro presente/);
  assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,3);
  await db.exec("delete from internal_automation_flows;insert into internal_automation_queue values('pending')");
  await assert.rejects(db.exec(migration),/lavoro presente/);
  await db.exec('delete from internal_automation_queue');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('select jobid::int id from cron.job order by jobid')).rows.map(x=>x.id),[2,3]);
  console.log('Cron legacy: lavoro presente protetto, destinazione esatta, altri job conservati, migrazione idempotente.');
} catch(e) {console.error('Prova cron fallita:',e.message);process.exitCode=1;}
finally {await db.close();}
