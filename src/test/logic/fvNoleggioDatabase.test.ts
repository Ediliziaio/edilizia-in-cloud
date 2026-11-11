import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect} from 'vitest';
const migration=readFileSync('supabase/migrations/20281110224501_fv_noleggio_economia_azienda.sql','utf8');
const A='a0000000-0000-0000-0000-000000000001',B='a0000000-0000-0000-0000-000000000002',ID='b0000000-0000-0000-0000-000000000001';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create type public.app_role as enum ('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select '10000000-0000-0000-0000-000000000001'::uuid$$;
 create function public.get_effective_company_id() returns uuid language sql stable as $$select nullif(current_setting('test.company',true),'')::uuid$$;
 create function public.utente_e_cliente_esterno() returns boolean language sql stable as $$select coalesce(nullif(current_setting('test.external',true),'')::boolean,false)$$;
 create function public.utente_bloccato() returns boolean language sql stable as $$select coalesce(nullif(current_setting('test.blocked',true),'')::boolean,false)$$;
 create function public.has_role(uuid,public.app_role) returns boolean language sql stable as $$select false$$;
 create function public.aziende_con_uno_dei_permessi(text[]) returns uuid[] language sql stable as $$select case when current_setting('test.edit',true)='true' then array[public.get_effective_company_id()] else array[]::uuid[] end$$;
 create table public.companies(id uuid primary key);insert into companies values ('${A}'),('${B}');
 create table public.fv_progetti(id uuid primary key,company_id uuid not null,modello_snapshot jsonb);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema auth,storage to authenticated;grant all on storage.objects to authenticated;
 create policy existing_company_storage on storage.objects for all to authenticated using((storage.foldername(name))[1]=public.get_effective_company_id()::text) with check((storage.foldername(name))[1]=public.get_effective_company_id()::text);`);
 await db.exec(migration);await db.exec(migration);
},120000);
afterAll(async()=>db?.close());beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback');});
async function asCompany(company=A,edit=true,external=false,blocked=false){await db.exec('reset role');for(const[k,v]of Object.entries({company,edit,external,blocked}))await db.query('select set_config($1,$2,true)',['test.'+k,String(v)]);await db.exec('set local role authenticated');}
async function insert(company=A,id=ID){return db.query(`insert into public.eic_tabelle_noleggio(id,company_id,contenuto) values ($1,$2,$3)`,[id,company,JSON.stringify({versione:1,id,companyId:company,righe:[{}]})]);}
async function rejects(fn:()=>Promise<unknown>){await db.exec('savepoint trial');let error:unknown;try{await fn();}catch(e){error=e;}await db.exec('rollback to savepoint trial');expect(error).toBeDefined();}
describe('archivio noleggio nel database',()=>{
 it('separa aziende, consente il cambio stato e conserva immutabili condizioni e fonte',async()=>{
  await asCompany();await insert();await db.query('update public.eic_tabelle_noleggio set attiva=false where id=$1',[ID]);expect((await db.query<{attiva:boolean}>('select attiva from public.eic_tabelle_noleggio')).rows).toEqual([{attiva:false}]);
  await rejects(()=>db.query("update public.eic_tabelle_noleggio set contenuto='{}' where id=$1",[ID]));await rejects(()=>db.query('delete from public.eic_tabelle_noleggio where id=$1',[ID]));
  await asCompany(B);expect((await db.query('select * from public.eic_tabelle_noleggio')).rows).toHaveLength(0);await rejects(()=>insert(A,'b0000000-0000-0000-0000-000000000002'));
 });
 it('il lettore non scrive e clienti esterni, utenti bloccati e anon non accedono',async()=>{
  await asCompany();await insert();await asCompany(A,false);await rejects(()=>insert(A,'b0000000-0000-0000-0000-000000000002'));expect((await db.query('select * from public.eic_tabelle_noleggio')).rows).toHaveLength(1);
  for(const[external,blocked]of [[true,false],[false,true]]){await asCompany(A,true,external,blocked);expect((await db.query('select * from public.eic_tabelle_noleggio')).rows).toHaveLength(0);await rejects(()=>insert(A,'b0000000-0000-0000-0000-000000000002'));}
  await db.exec('reset role;set local role anon');await rejects(()=>db.query('select * from public.eic_tabelle_noleggio'));
 });
 it('protegge gli originali archiviati, senza cambiare i permessi degli altri finanziamenti',async()=>{
  await asCompany();const path=A+'/noleggio/'+ID+'/originale-0.pdf';await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['finanziamenti-tabelle',path]);await db.exec('reset role');await db.query('insert into eic_tabelle_noleggio(id,company_id,contenuto,originali_paths) values($1,$2,$3,$4)',[ID,A,JSON.stringify({versione:1,id:ID,companyId:A,righe:[{}]}),[path]]);
  await asCompany();expect((await db.query('delete from storage.objects where name=$1 returning name',[path])).rows).toHaveLength(0);expect((await db.query("update storage.objects set name=name||'.new' where name=$1 returning name",[path])).rows).toHaveLength(0);
  await asCompany(B);expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
 });
 it('accetta i due modelli aziendali e rifiuta snapshot di un’altra azienda',async()=>{
  for(const modelId of ['aziendale','aziendale-noleggio'])await db.query('insert into fv_progetti(id,company_id,modello_snapshot) values(gen_random_uuid(),$1,$2)',[A,JSON.stringify({version:1,companyId:A,modelId,template:{company_id:A,pdf_blocchi:{modulo_intervento:modelId}}})]);
  await rejects(()=>db.query('insert into fv_progetti(id,company_id,modello_snapshot) values(gen_random_uuid(),$1,$2)',[A,JSON.stringify({version:1,companyId:B,modelId:'aziendale',template:{company_id:B,pdf_blocchi:{modulo_intervento:'aziendale'}}})]));
 });
});
