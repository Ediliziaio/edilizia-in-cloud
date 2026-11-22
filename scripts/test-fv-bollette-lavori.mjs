import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const company='e1000000-0000-4000-a000-000000000001',other='e1000000-0000-4000-a000-000000000002';
const project='e2000000-0000-4000-a000-000000000001',hidden='e2000000-0000-4000-a000-000000000002',foreign='e2000000-0000-4000-a000-000000000003';
const user='e3000000-0000-4000-a000-000000000001',token='e4000000-0000-4000-a000-000000000001',next='e4000000-0000-4000-a000-000000000002';
const path=company+'/'+project+'/'+'a'.repeat(64)+'.pdf';
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.v;
const claim=(t=token,retry=false,p=path,pr=project)=>value('select fv_bolletta_prendi_lavoro($1,$2,$3,$4,$5,$6) v',[pr,p,'Bolletta di prova.pdf',user,t,retry]);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table companies(id uuid primary key);create table fv_progetti(id uuid primary key,company_id uuid,stato text,deleted_at timestamptz,analisi_consumi jsonb);
 alter table fv_progetti enable row level security;grant select on fv_progetti to authenticated;
 create schema auth;create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
 create function utente_bloccato() returns boolean language sql stable as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
 create function aziende_con_permesso(text) returns uuid[] language sql stable as $$select case when coalesce(current_setting('fixture.read',true),'true')<>'false' then array[current_setting('fixture.company',true)::uuid] else '{}'::uuid[] end$$;
 grant usage on schema auth to authenticated;
 create policy progetto_visibile on fv_progetti for select to authenticated using(id::text=current_setting('fixture.project',true) and company_id::text=current_setting('fixture.company',true));`);
 await db.query('insert into companies values($1),($2)',[company,other]);
 await db.query("insert into fv_progetti(id,company_id,stato,deleted_at) values($1,$2,'bozza',null),($3,$2,'bozza',null)",[project,company,hidden]);
 await db.query("insert into fv_progetti(id,company_id,stato,deleted_at) values($1,$2,'bozza',null)",[foreign,other]);
 // Usa la funzione effettiva, non uno stub con un nome o una firma inventati.
 const storageMigration=readFileSync('supabase/migrations/20290430140000_fv_bollette_mappa_scenari.sql','utf8');
 await db.exec(storageMigration.slice(storageMigration.indexOf('CREATE OR REPLACE FUNCTION public.fv_bollette_accesso('),storageMigration.indexOf('CREATE OR REPLACE FUNCTION public.fv_consumi_proteggi(')));
 const migration=readFileSync(process.env.FV_JOBS_MIGRATION||'supabase/migrations/20290506160000_fv_bollette_letture_recuperabili.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 const claims=await Promise.all([claim(),claim(next)]);assert.equal(claims.filter(x=>x.avviata).length,1);
 const id=claims[0].id;
 await db.exec("update fv_bollette_letture set scade_il=clock_timestamp()-interval '1 second'");
 assert.equal((await claim(next)).avviata,true);
 assert.equal(await value('select fv_bolletta_concludi_lavoro($1,$2,200,$3) v',[id,token,JSON.stringify({documenti:[{id:'prima'}]})]),false);
 assert.equal(await value('select fv_bolletta_concludi_lavoro($1,$2,200,$3) v',[id,next,JSON.stringify({documenti:[{id:'completa'}]})]),true);
 const replay=await claim();assert.equal(replay.avviata,false);assert.deepEqual(replay.documenti,[{id:'completa'}]);assert.equal('token' in replay,false);
 await assert.rejects(claim(token,false,path.replace(company,other)),/non valida/);
 await db.query("update fv_progetti set stato='emesso' where id=$1",[project]);await assert.rejects(claim(token,true),/non è modificabile/);
 await db.query("update fv_progetti set stato='bozza' where id=$1",[project]);assert.equal((await claim(token,true)).avviata,true);
 assert.equal(await value('select fv_bolletta_concludi_lavoro($1,$2,402,$3) v',[id,token,JSON.stringify({error:'Crediti AI esauriti'})]),true);
 assert.equal((await claim()).stato,'fallita');assert.equal((await claim(next,true)).avviata,true);
 await claim(token,false,other+'/'+foreign+'/'+'b'.repeat(64)+'.pdf',foreign);
 await db.query("select set_config('fixture.company',$1,false)",[company]);
 // Anche un collega della stessa azienda senza accesso al progetto non legge i risultati.
 await db.query('select set_config(\'fixture.project\',$1,false)',[hidden]);await db.exec('set role authenticated');
 assert.equal(await value('select count(id)::int v from fv_bollette_letture'),0);
 await db.query('select set_config(\'fixture.project\',$1,false)',[project]);assert.equal(await value('select count(id)::int v from fv_bollette_letture'),1);
 await db.exec("set fixture.read='false'");assert.equal(await value('select count(id)::int v from fv_bollette_letture'),0);await db.exec("set fixture.read='true'");
 await db.query("select set_config('fixture.project',$1,false)",[foreign]);assert.equal(await value('select count(id)::int v from fv_bollette_letture'),0);await db.query("select set_config('fixture.project',$1,false)",[project]);
 await assert.rejects(db.query('select token from fv_bollette_letture'),/permission denied/);
 await assert.rejects(db.query("update fv_bollette_letture set stato='completata'"),/permission denied/);
 await assert.rejects(claim(),/permission denied/);await db.exec('reset role');
 for(const f of ['fv_bolletta_prendi_lavoro(uuid,text,text,uuid,uuid,boolean,integer)','fv_bolletta_concludi_lavoro(uuid,uuid,integer,jsonb)']){
  assert.equal(await value('select has_function_privilege(\'anon\',$1,\'EXECUTE\') v',[f]),false);
  assert.equal(await value('select has_function_privilege(\'authenticated\',$1,\'EXECUTE\') v',[f]),false);
  assert.equal(await value('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') v',[f]),true);
 }
 console.log('Bollette asincrone SQL: lease, token, ripresa, cache esito, progetto emesso, RLS staff e privilegi verificati.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
