import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('ricicla solo il pool inattivo: preserva LISTEN, query attive, transazioni e connessioni recenti',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema cron; create table cron.jobs(name text primary key,schedule text,command text);
 create function cron.schedule(n text,s text,c text) returns void language sql as $$insert into cron.jobs values(n,s,c) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command$$;
 create table fixture_activity(pid int,application_name text,backend_type text,state text,xact_start timestamptz,query text,backend_start timestamptz,state_change timestamptz);
 create table terminated(pid int);
 create function test_terminate(p int) returns boolean language plpgsql as $$begin insert into terminated values(p);return true;end$$;
 insert into fixture_activity select i,'postgrest','client backend','idle',null,'SELECT 1',now()-interval '2 hours',now()-interval '1 minute' from generate_series(1,8) i;
 update fixture_activity set query='LISTEN "pgrst"' where pid=2;
 update fixture_activity set query=E'  listen "pgrst"' where pid=3;
 update fixture_activity set state='active' where pid=4;
 update fixture_activity set xact_start=now() where pid=5;
 update fixture_activity set backend_start=now() where pid=6;
 update fixture_activity set state_change=now() where pid=7;
 update fixture_activity set application_name='altro' where pid=8;
 `);
 const sql=readFileSync('supabase/migrations/20281216160000_riciclo_postgrest_preserva_listener.sql','utf8');
 await db.exec(sql);await db.exec(sql);
 const jobs=(await db.query<{command:string}>('select command from cron.jobs')).rows;
 expect(jobs).toHaveLength(1);
 await db.exec(jobs[0].command.replace('pg_stat_activity','fixture_activity').replace('pg_terminate_backend','test_terminate'));
 expect((await db.query('select pid from terminated')).rows).toEqual([{pid:1}]);
 } finally {await db.close();}
},30000);
