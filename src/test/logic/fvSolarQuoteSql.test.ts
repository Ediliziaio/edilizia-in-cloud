import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
const demo="d2000000-0000-4000-a000-000000000002",progetto="bf2e40da-e1eb-4380-be27-750fbcdd2ac1";
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`
create role anon;create role authenticated;create role service_role;create schema auth;
create type public.app_role as enum ('super_admin','company_admin');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.utente_bloccato() returns boolean language sql stable as $$select false$$;
create function public.utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
create function public.check_staff_visibility(uuid,uuid) returns boolean language sql stable as $$select true$$;
create function public.has_role(uuid,public.app_role) returns boolean language sql stable as $$select false$$;
create function public.aziende_con_permesso(text) returns uuid[] language sql stable as $$select case when current_setting('test.edit',true)='yes' then array['${demo}'::uuid] else array[]::uuid[] end$$;
create table public.fv_progetti(id uuid,company_id uuid,created_by uuid,deleted_at timestamptz,stato text);
insert into public.fv_progetti values('${progetto}','${demo}','11111111-1111-4111-8111-111111111111',null,'bozza');
create table public.fv_solar_api_usage(id uuid default gen_random_uuid() primary key,company_id uuid,endpoint text,source text,call_count integer,cost_estimate_eur numeric,mese_anno text,created_at timestamptz default now());
create table public.fv_solar_api_cache(created_at timestamptz,expires_at timestamptz);
`);await db.exec(readFileSync(resolve(__dirname,'../../../supabase/migrations/20290506140000_fv_solar_richieste_autentiche.sql'),'utf8'));},30000);
afterAll(async()=>{await db?.close();});
describe("Permessi e prenotazione atomica Solar",()=>{
 it("chiude il consumo ai ruoli pubblici",async()=>{const {rows}=await db.query<{anon:boolean;authenticated:boolean;service:boolean}>(`select has_function_privilege('anon','public.fv_solar_prenota_richiesta(uuid,text)','execute') as anon,has_function_privilege('authenticated','public.fv_solar_prenota_richiesta(uuid,text)','execute') as authenticated,has_function_privilege('service_role','public.fv_solar_prenota_richiesta(uuid,text)','execute') as service`);expect(rows[0]).toEqual({anon:false,authenticated:false,service:true});});
 it("nega chi è anonimo, non ha permesso, o apre un preventivo già emesso",async()=>{await db.exec("set test.uid='';set test.edit='yes'");const leggi=async()=> (await db.query<{ok:boolean}>(`select public.fv_solar_accesso('${progetto}') as ok`)).rows[0].ok;expect(await leggi()).toBe(false);await db.exec("set test.uid='11111111-1111-4111-8111-111111111111';set test.edit='no'");expect(await leggi()).toBe(false);await db.exec("set test.edit='yes'");expect(await leggi()).toBe(true);await db.exec("update public.fv_progetti set stato='emesso'");expect(await leggi()).toBe(false);});
 it("prenota prima della chiamata e si ferma al limite per azienda",async()=>{for(let i=0;i<20;i++){const {rows}=await db.query<{id:string|null}>(`select public.fv_solar_prenota_richiesta('${demo}',$1) as id`,[i%2?'buildingInsights':'dataLayers']);expect(rows[0].id).not.toBeNull();}const {rows}=await db.query<{id:string|null}>(`select public.fv_solar_prenota_richiesta('${demo}','buildingInsights') as id`);expect(rows[0].id).toBeNull();expect((await db.query<{n:number}>("select count(*)::integer as n from public.fv_solar_api_usage")).rows[0].n).toBe(20);});
});
