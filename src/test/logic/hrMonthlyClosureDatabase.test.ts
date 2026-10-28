import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
const c="10000000-0000-4000-8000-000000000001",u="10000000-0000-4000-8000-000000000002";
async function setup(){
 const db=new PGlite();
 await db.exec(`create schema auth;create role authenticated;create role anon;create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select '${u}'::uuid$$;
 create function e_amministratore_di(uuid) returns boolean language sql stable as $$select $1='${c}'::uuid and coalesce(current_setting('test.admin',true),'yes')<>'no'$$;
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
 create function utente_bloccato() returns boolean language sql stable as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'no')='yes'$$;
 create function get_my_company_id() returns uuid language sql stable as $$select '${c}'::uuid$$;
 create table companies(id uuid primary key);insert into companies values('${c}');
 create table hr_profili(id uuid primary key,company_id uuid,attivo boolean,data_assunzione date,data_cessazione date,giorni_lavorativi text[]);
 create table hr_festivita(company_id uuid,data date,ricorrente boolean);
 create table hr_giornate(id uuid primary key default gen_random_uuid(),company_id uuid,profilo_id uuid,data date,stato text,anomalia boolean,prima_entrata time,ultima_uscita time,ore_lavorate numeric,ore_straordinario numeric);
 create table hr_timbrature(id uuid primary key default gen_random_uuid(),company_id uuid,profilo_id uuid,data_evento date);
 create table hr_richieste(id uuid primary key default gen_random_uuid(),company_id uuid,data_inizio date,data_fine date,stato text);
 insert into hr_profili values('${u}','${c}',true,'2001-09-30',null,array['Dom']);
 insert into hr_giornate(company_id,profilo_id,data,stato,anomalia,prima_entrata,ultima_uscita,ore_lavorate,ore_straordinario)
 values('${c}','${u}','2001-09-30','presente',false,'08:00','16:00',8,0);
 grant usage on schema auth,public to authenticated;
 grant select,insert,update,delete on hr_giornate,hr_richieste,hr_timbrature to authenticated;`);
 await db.exec(readFileSync("supabase/migrations/20261026202733_hr_chiusura_mese_autorizzata.sql","utf8"));
 await db.exec("set role authenticated");
 return db;
}
const transition=(db:PGlite,state:string,rev:number,reason="Controllo mese completato")=>db.query<{value:{revisione:number;stato:string}}>(`select hr_transizione_mese($1,'2001-09-01',$2,$3,$4) value`,[c,rev,state,reason]);
it("closes atomically, blocks every late HR write, and reopens only with a reason and immutable history",async()=>{
 const db=await setup();try{
  expect((await transition(db,"chiuso",0)).rows[0].value).toEqual({revisione:1,stato:"chiuso"});
  await expect(db.exec("update hr_giornate set ore_lavorate=7")).rejects.toThrow("riapertura autorizzata");
  await expect(db.exec(`insert into hr_timbrature(company_id,data_evento) values('${c}','2001-09-30')`)).rejects.toThrow("riapertura autorizzata");
  await expect(db.exec(`insert into hr_richieste(company_id,data_inizio,data_fine,stato) values('${c}','2001-08-30','2001-09-01','in_attesa')`)).rejects.toThrow("riapertura autorizzata");
  await expect(transition(db,"aperto",1,"")).rejects.toThrow("motivo");
  await expect(transition(db,"aperto",0,"Rettifica autorizzata")).rejects.toThrow("è cambiato");
  expect((await transition(db,"aperto",1,"Rettifica timbratura documentata")).rows[0].value).toEqual({revisione:2,stato:"aperto"});
  await db.exec("update hr_giornate set ore_lavorate=7");
  const {rows}=await db.query<{stato:string;revisione:number;snapshot:{giornate:{ore_lavorate:number}[]}}>("select stato,revisione,snapshot from hr_chiusure_storico order by revisione");
  expect(rows).toHaveLength(2);expect(rows[0].snapshot.giornate[0].ore_lavorate).toBe(8);
  await expect(db.exec("delete from hr_chiusure_storico")).rejects.toThrow("permission denied");
  await expect(db.exec("select snapshot from hr_chiusure_mensili")).rejects.toThrow("permission denied");
 }finally{await db.close();}
},30000);
it("refuses closure for open punches, pending requests, missing workdays or unknown schedules without partial history",async()=>{
 const db=await setup();try{
  await db.exec("update hr_giornate set ultima_uscita=null");
  await expect(transition(db,"chiuso",0)).rejects.toThrow("anomalie");
  await db.exec("update hr_giornate set ultima_uscita='16:00'");
  await db.exec(`insert into hr_timbrature(company_id,profilo_id,data_evento) values('${c}','${u}','2001-09-29')`);
  await expect(transition(db,"chiuso",0)).rejects.toThrow("senza giornata HR consolidata");
  await db.exec("delete from hr_timbrature");
  await db.exec(`insert into hr_richieste(company_id,data_inizio,data_fine,stato) values('${c}','2001-09-01','2001-09-01','in_attesa')`);
  await expect(transition(db,"chiuso",0)).rejects.toThrow("in attesa");
  await db.exec("delete from hr_richieste; reset role; update hr_profili set giorni_lavorativi='{}';set role authenticated");
  await expect(transition(db,"chiuso",0)).rejects.toThrow("calendari");
  await db.exec("reset role; update hr_profili set giorni_lavorativi=array['Dom'],data_assunzione='2001-09-01';set role authenticated");
  await expect(transition(db,"chiuso",0)).rejects.toThrow("senza registrazione");
  expect((await db.query("select revisione from hr_chiusure_mensili")).rows).toHaveLength(0);
  expect((await db.query("select * from hr_chiusure_storico")).rows).toHaveLength(0);
 }finally{await db.close();}
},30000);
it("keeps company isolation, blocks deletes and moves out of closed periods, and retains each closure snapshot",async()=>{
 const db=await setup();try{
  await db.exec("select set_config('test.readonly','yes',false)");
  await expect(transition(db,"chiuso",0)).rejects.toThrow("non consentita");
  await db.exec("select set_config('test.readonly','no',false)");
  await transition(db,"chiuso",0);
  await expect(db.exec("delete from hr_giornate")).rejects.toThrow("riapertura autorizzata");
  await expect(db.exec("update hr_giornate set data='2001-10-01'")).rejects.toThrow("riapertura autorizzata");
  await db.exec("reset role; insert into companies values('20000000-0000-4000-8000-000000000001'); set role authenticated");
  await expect(db.query("select hr_transizione_mese('20000000-0000-4000-8000-000000000001','2001-09-01',0,'chiuso','Prova isolamento azienda')")).rejects.toThrow("non consentita");
  await transition(db,"aperto",1,"Rettifica documentata ore");
  await db.exec("update hr_giornate set ore_lavorate=7");
  await transition(db,"chiuso",2,"Rettifica verificata e completata");
  const {rows}=await db.query<{revisione:number;snapshot:{giornate:{ore_lavorate:number}[]}}>("select revisione,snapshot from hr_chiusure_storico where stato='chiuso' order by revisione");
  expect(rows.map(r=>[r.revisione,r.snapshot.giornate[0].ore_lavorate])).toEqual([[1,8],[3,7]]);
 }finally{await db.close();}
},30000);
it("denies non-admin reopening, future months and direct metadata tampering",async()=>{
 const db=await setup();try{
  await transition(db,"chiuso",0);
  await db.exec("select set_config('test.admin','no',false)");
  await expect(transition(db,"aperto",1,"Rettifica autorizzata")).rejects.toThrow("non consentita");
  await expect(db.exec("update hr_chiusure_mensili set stato='aperto',motivo='Rettifica non autorizzata'")).resolves.toBeTruthy();
  // RLS affects zero rows rather than permitting a silent reopen.
  expect((await db.query("select stato from hr_chiusure_mensili")).rows).toEqual([{stato:"chiuso"}]);
  await db.exec("select set_config('test.admin','yes',false)");
  await expect(db.query(`select hr_transizione_mese($1,'2099-01-01',0,'chiuso','Prova mese futuro')`,[c])).rejects.toThrow("concluso");
  await expect(db.exec("update hr_chiusure_mensili set revisione=999")).rejects.toThrow("già in questo stato");
  const {rows}=await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.hr_transizione_mese(uuid,date,integer,text,text)','execute') allowed");
  expect(rows[0].allowed).toBe(false);
 }finally{await db.close();}
},30000);
