/// <reference types="node" />
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const C='10000000-0000-4000-a000-000000000001', OTHER='10000000-0000-4000-a000-000000000002',
  U='20000000-0000-4000-a000-000000000001', O='30000000-0000-4000-a000-000000000001',
  S='40000000-0000-4000-a000-000000000001', FOREIGN='40000000-0000-4000-a000-000000000002',
  P='50000000-0000-4000-a000-000000000001', P2='50000000-0000-4000-a000-000000000002';
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.actor',true),'')::uuid$$;
    create function utente_bloccato() returns boolean language sql as $$select false$$;
    create function utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select current_setting('app.allowed',true)='true' and $3=current_setting('app.company')::uuid$$;
    create table orders(id uuid primary key, company_id uuid,deleted_at timestamptz);
    create table order_work_phases(id uuid primary key,order_id uuid,company_id uuid);
    create table subappaltatori(id uuid primary key,company_id uuid,ragione_sociale text,responsabile text,telefono text,email text,is_active boolean);
    create table external_teams(id uuid primary key default gen_random_uuid(),company_id uuid,name text,contact_name text,phone text,email text,kind text,is_active boolean,subappaltatore_id uuid,created_at timestamptz default now(),vat_rate numeric default 22);
    create table order_external_teams(id uuid primary key default gen_random_uuid(),order_id uuid,external_team_id uuid,phase_id uuid,cost_preventivo numeric,total_cost numeric,vat_rate numeric,is_paid boolean,notes text check(notes is distinct from 'FAIL_AFTER_BRIDGE'));
    insert into orders values('${O}','${C}',null);
    insert into order_work_phases values('${P}','${O}','${C}'),('${P2}','${O}','${C}');
    insert into subappaltatori(id,company_id,ragione_sociale,is_active) values('${S}','${C}','Ditta sintetica',true),('${FOREIGN}','${OTHER}','Altra azienda',true);
    grant usage on schema public,auth to authenticated,anon;
    grant select,insert,update on all tables in schema public to authenticated;
    alter table orders enable row level security;
    create policy tenant_orders on orders to authenticated using(company_id=current_setting('app.company')::uuid);
    alter table subappaltatori enable row level security;
    create policy tenant_sub on subappaltatori to authenticated using(company_id=current_setting('app.company')::uuid);
    alter table external_teams enable row level security;
    create policy tenant_teams on external_teams to authenticated using(company_id=current_setting('app.company')::uuid) with check(company_id=current_setting('app.company')::uuid);
    set app.actor='${U}';set app.company='${C}';set app.allowed='true';`);
  const sql=readFileSync('supabase/migrations/20261028140816_commessa_ditta_da_subappaltatore_atomica.sql','utf8');
  await db.exec(sql); await db.exec(sql);
},30000);
beforeEach(async()=>{await db.exec(`reset role;truncate order_external_teams,external_teams; update subappaltatori set is_active=true;set app.actor='${U}';set app.company='${C}';set app.allowed='true';set role authenticated;`);});
afterAll(async()=>{await db?.close();});
const assign=(phase:string|null=P,sub=S,notes:string|null=null,amount=1500.5)=>db.query('select commessa_assegna_subappaltatore($1::uuid,$2::uuid,$3::uuid,$4::numeric,0,$5::text) as id',[O,sub,phase,amount,notes]);
const counts=async()=> (await db.query<{teams:number;assignments:number}>('select (select count(*)::int from external_teams) teams,(select count(*)::int from order_external_teams) assignments')).rows[0];
describe('ponte subappaltatore → ditta e assegnazione atomica, DB isolato',()=>{
  it('crea il collegamento soltanto alla conferma e conserva gli importi',async()=>{
    expect(await counts()).toEqual({teams:0,assignments:0}); await assign();
    expect(await counts()).toEqual({teams:1,assignments:1});
    expect((await db.query('select subappaltatore_id,name from external_teams')).rows[0]).toMatchObject({subappaltatore_id:S,name:'Ditta sintetica'});
    expect((await db.query('select cost_preventivo,phase_id from order_external_teams')).rows[0]).toMatchObject({cost_preventivo:'1500.50',phase_id:P});
  });
  it('riusa il ponte su fasi diverse e impedisce il doppio inserimento',async()=>{
    await assign(); await assign(P2); expect(await counts()).toEqual({teams:1,assignments:2});
    await expect(assign()).rejects.toThrow('già assegnata'); expect(await counts()).toEqual({teams:1,assignments:2});
  });
  it('un errore dopo la creazione del ponte non lascia anagrafiche operative orfane',async()=>{
    await expect(assign(P,S,'FAIL_AFTER_BRIDGE')).rejects.toThrow(); expect(await counts()).toEqual({teams:0,assignments:0});
  });
  it('non modifica né riattiva una ditta esistente disattivata',async()=>{
    await db.query("insert into external_teams(company_id,name,kind,is_active,subappaltatore_id) values($1,'Storica','esterna',false,$2)",[C,S]);
    await expect(assign()).rejects.toThrow('disattivata'); expect(await counts()).toEqual({teams:1,assignments:0});
  });
  it('rifiuta altri tenant, sub inattivi, fasi estranee e costi negativi',async()=>{
    await expect(assign(P,FOREIGN)).rejects.toThrow('non disponibile');
    await expect(assign(FOREIGN)).rejects.toThrow('lavorazione');
    await expect(assign(P,S,null,-1)).rejects.toThrow('importi');
    await db.query('update subappaltatori set is_active=false where id=$1',[S]);
    await expect(assign()).rejects.toThrow('non disponibile'); expect(await counts()).toEqual({teams:0,assignments:0});
  });
  it('nega scritture senza autorizzazione, non elevando i privilegi RLS',async()=>{
    await db.exec("set app.allowed='false'"); await expect(assign()).rejects.toThrow('modificabile');
    await db.exec("set app.allowed='true';set app.actor=''"); await expect(assign()).rejects.toThrow('autorizzato');
    expect(await counts()).toEqual({teams:0,assignments:0});
    const meta=(await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where proname='commessa_assegna_subappaltatore'")).rows[0]; expect(meta.prosecdef).toBe(false);
  });
  it('nega l’esecuzione anonima',async()=>{
    await db.exec('reset role;set role anon'); await expect(assign()).rejects.toThrow('permission denied');
  });
});
