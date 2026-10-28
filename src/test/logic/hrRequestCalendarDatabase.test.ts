import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
const company="10000000-0000-4000-8000-000000000001", profile="10000000-0000-4000-8000-000000000002", req="10000000-0000-4000-8000-000000000003";
async function setup() {
  const db=new PGlite();
  await db.exec(`create schema auth; create role authenticated;create role anon;create type app_role as enum('super_admin');
    create function auth.uid() returns uuid language sql as $$select '${profile}'::uuid$$;
    create function e_amministratore_di(uuid) returns boolean language sql as $$select $1='${company}'::uuid$$;
    create function has_role(uuid,app_role) returns boolean language sql as $$select false$$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function log_activity(uuid,text,text,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text) returns void language sql as $$select$$;
    create table profiles(id uuid,company_id uuid);insert into profiles values('${profile}','${company}');
    create table multi_company_access(user_id uuid,company_id uuid,status text,expires_at timestamptz);
    create table hr_profili(id uuid primary key,company_id uuid,nome text,cognome text,giorni_lavorativi text[],ore_giornaliere numeric,ferie_residue numeric,permessi_residui_ore numeric,rol_residuo_ore numeric,updated_at timestamptz);
    create table hr_richieste(id uuid primary key,company_id uuid,profilo_id uuid,tipo text,data_inizio date,data_fine date,ore_richieste numeric,stato text,note_risposta text,approvata_il timestamptz,approvata_da uuid,updated_at timestamptz);
    create table hr_festivita(company_id uuid,data date,ricorrente boolean);
    create table hr_giornate(id uuid primary key default gen_random_uuid(),company_id uuid,profilo_id uuid,data date,stato text,ore_previste numeric,ore_lavorate numeric,ore_pausa numeric,note text,bloccata boolean,source text,updated_at timestamptz,prima_entrata time,ultima_uscita time,anomalia boolean,anomalia_motivo text);
    insert into hr_profili(id,company_id,nome,cognome,giorni_lavorativi,ore_giornaliere,ferie_residue,permessi_residui_ore,rol_residuo_ore) values('${profile}','${company}','Test','Persona',array['Lun','Mar','Mer','Gio','Ven'],8,20,30,10);
    insert into hr_richieste(id,company_id,profilo_id,tipo,data_inizio,data_fine,stato) values('${req}','${company}','${profile}','ferie','2026-04-03','2026-04-07','in_attesa');
    insert into hr_festivita values('${company}','2026-04-06',false);`);
  await db.exec(readFileSync("src/test/fixtures/hr-request-before-calendar.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261026200117_hr_richieste_calendario_verificato.sql","utf8"));
  return db;
}
it("uses workdays, holidays and snapshots; retries and later calendar changes cannot alter the refund",async()=>{
  const db=await setup();try {
    await db.query(`select hr_update_richiesta_stato('${req}','approvata')`);
    expect((await db.query("select ferie_residue from hr_profili")).rows).toEqual([{ferie_residue:"18"}]);
    expect((await db.query("select data::text from hr_giornate order by data")).rows).toEqual([{data:"2026-04-03"},{data:"2026-04-07"}]);
    await db.query(`select hr_update_richiesta_stato('${req}','approvata')`);
    await db.exec("update hr_profili set giorni_lavorativi=array['Sab']; delete from hr_festivita;");
    await db.query(`select hr_update_richiesta_stato('${req}','revocata')`);
    await db.query(`select hr_update_richiesta_stato('${req}','revocata')`);
    expect((await db.query("select ferie_residue from hr_profili")).rows).toEqual([{ferie_residue:"20"}]);
    expect((await db.query("select * from hr_giornate")).rows).toHaveLength(0);
  }finally{await db.close();}
},30000);
it("a permission never fabricates worked hours; rejects hours beyond capacity atomically",async()=>{
  const db=await setup();try {
    await db.exec("update hr_richieste set tipo='permesso',ore_richieste=4");
    await db.query(`select hr_update_richiesta_stato('${req}','approvata')`);
    expect((await db.query("select ore_lavorate from hr_giornate")).rows).toEqual([{ore_lavorate:"0"}]);
    expect((await db.query("select permessi_residui_ore from hr_profili")).rows).toEqual([{permessi_residui_ore:"26"}]);
    await db.query(`select hr_update_richiesta_stato('${req}','revocata')`);
    await db.exec("update hr_richieste set ore_richieste=20");
    await expect(db.query(`select hr_update_richiesta_stato('${req}','approvata')`)).rejects.toThrow("superano");
    expect((await db.query("select permessi_residui_ore from hr_profili")).rows).toEqual([{permessi_residui_ore:"30"}]);
  }finally{await db.close();}
},30000);
it("refuses an unknown workweek without spending any balance",async()=>{
  const db=await setup();try {
    await db.exec("update hr_profili set giorni_lavorativi='{}'");
    await expect(db.query(`select hr_update_richiesta_stato('${req}','approvata')`)).rejects.toThrow("configurare");
    expect((await db.query("select stato from hr_richieste")).rows).toEqual([{stato:"in_attesa"}]);
  }finally{await db.close();}
},30000);
